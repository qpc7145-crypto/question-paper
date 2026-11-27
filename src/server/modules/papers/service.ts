import { z } from "zod";
import type { PaperStatus, Prisma } from "@prisma/client";
import { prisma, withTx, lockPaper, type Tx } from "@/server/core/db";
import { HttpError } from "@/server/core/http";
import { writeAudit } from "@/server/modules/audit/service";
import { assertCanSend, MODEL_PAPER_SCOPE, paperById, paperScope, type Actor, type PaperPurpose } from "@/server/policy";
import { termLabel, termWhere } from "@/server/modules/academics/terms";
import { assertEditable, assertTransition, canSendFromStatus, hasContent } from "./lifecycle";
import { cleanHtml } from "./sanitize";
import { flatContent, paperInclude, paperState, type PaperFull } from "./serializers";
import { saveUpload } from "@/server/infra/storage";
import { getCurrentSemester } from "@/server/modules/settings/service";
import { PAPER_STATUSES } from "@/lib/constants";

export const contentSchema = z.object({
  format: z.enum(["RICH_TEXT", "FILE"]).optional(),
  mode: z.enum(["FREE", "STRUCTURED"]).optional(),
  contentHtml: z.string().max(2_000_000).optional(),
  sectionAHtml: z.string().max(2_000_000).optional(),
  sectionBHtml: z.string().max(2_000_000).optional(),
  sectionCHtml: z.string().max(2_000_000).optional(),
  instructions: z.string().max(5000).optional(),
  totalMarks: z.number().int().min(0).max(1000).nullable().optional(),
  durationMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  note: z.string().max(500).optional(),
});
export type ContentInput = z.infer<typeof contentSchema>;

const notFound = () => new HttpError(404, "Paper not found");

// ---------- Reads ----------

export async function getPaper(actor: Actor, id: string, purpose: PaperPurpose = "read", db: Tx | typeof prisma = prisma) {
  const p = await db.paper.findFirst({ where: paperById(actor, id, purpose), include: paperInclude });
  if (!p) throw notFound();
  return p;
}

export function parseStatus(s: string | null): PaperStatus | undefined | null {
  if (!s) return undefined;
  return (PAPER_STATUSES as readonly string[]).includes(s) ? (s as PaperStatus) : null;
}

const SORT = {
  examDate: { exam: { examDate: "asc" } },
  deadline: { exam: { submissionDeadline: "asc" } },
} satisfies Record<string, Prisma.PaperOrderByWithRelationInput>;

export async function listPapers(
  actor: Actor,
  filter: { semester?: string; status?: string | null },
  sort: keyof typeof SORT,
): Promise<PaperFull[]> {
  const status = parseStatus(filter.status ?? null);
  if (status === null) return []; // unknown status filter: nothing matches
  return prisma.paper.findMany({
    where: { AND: [paperScope(actor, "list"), { ...(status && { status }), exam: { term: termWhere(filter.semester) } }] },
    include: paperInclude,
    orderBy: SORT[sort],
  });
}

// Distinct semesters of the papers in the caller's list, for the semester filter.
export async function listPaperSemesters(actor: Actor) {
  const rows = await prisma.paper.findMany({ where: paperScope(actor, "list"), select: { exam: { select: { term: true } } } });
  return Array.from(new Set(rows.map((r) => termLabel(r.exam.term))));
}

// Locks the row, then re-reads it through the caller's scope inside the transaction.
async function lockVisible(tx: Tx, actor: Actor, id: string) {
  await lockPaper(tx, id);
  return getPaper(actor, id, "read", tx);
}

const reload = (tx: Tx, id: string) => tx.paper.findUniqueOrThrow({ where: { id }, include: paperInclude });

// ---------- Versions ----------

type Content = ReturnType<typeof flatContent>;

function versionData(c: Content) {
  return {
    format: c.format,
    mode: c.mode,
    content: { contentHtml: c.contentHtml, sections: { A: c.sectionAHtml, B: c.sectionBHtml, C: c.sectionCHtml } },
    instructions: c.instructions,
    totalMarks: c.totalMarks,
    durationMinutes: c.durationMinutes,
    fileId: c.fileId,
  } satisfies Omit<Prisma.PaperVersionUncheckedCreateInput, "paperId" | "number" | "authorId" | "authorRole">;
}

// Applies a change to the paper's content.
//  - The setter's own unfrozen draft is edited in place (drafts autosave; one version per draft).
//  - Anything else adds a new version, frozen unless it is a setter's new draft.
// Returns whether a new version was created.
async function changeContent(
  tx: Tx,
  actor: Actor,
  p: PaperFull,
  next: Content,
  opts: { note?: string; freeze: boolean },
) {
  const cur = p.currentVersion;
  if (cur && !cur.frozenAt && cur.authorId === actor.id && !opts.freeze) {
    await tx.paperVersion.update({ where: { id: cur.id }, data: versionData(next) });
    return false;
  }
  const number = (await tx.paperVersion.count({ where: { paperId: p.id } })) + 1;
  const v = await tx.paperVersion.create({
    data: {
      paperId: p.id,
      number,
      ...versionData(next),
      authorId: actor.id,
      authorRole: actor.role,
      note: opts.note ?? "",
      frozenAt: opts.freeze ? new Date() : null,
    },
  });
  await tx.paper.update({ where: { id: p.id }, data: { currentVersionId: v.id } });
  return true;
}

// A new, empty working draft for a (re-)assigned setter. The previous draft is frozen and kept.
export async function startDraft(tx: Tx, paperId: string, setterId: string) {
  const cur = await tx.paper.findUniqueOrThrow({ where: { id: paperId }, select: { currentVersionId: true } });
  if (cur.currentVersionId) {
    await tx.paperVersion.updateMany({ where: { id: cur.currentVersionId, frozenAt: null }, data: { frozenAt: new Date() } });
  }
  const number = (await tx.paperVersion.count({ where: { paperId } })) + 1;
  const v = await tx.paperVersion.create({
    data: { paperId, number, content: { contentHtml: "", sections: { A: "", B: "", C: "" } }, authorId: setterId, authorRole: "SETTER" },
  });
  await tx.paper.update({ where: { id: paperId }, data: { currentVersionId: v.id } });
}

// ---------- Content (FR-10, FR-12, FR-13) ----------

// Shared content update for Setter (draft), Controller (FR-12) and Typist (FR-13).
// Any edit by someone other than the setter is a revision: it adds a frozen version and
// moves the paper to UNDER_MODIFICATION.
export async function updateContent(actor: Actor, paperId: string, input: ContentInput) {
  const isModification = actor.role !== "SETTER";
  return withTx(async (tx) => {
    const p = await lockVisible(tx, actor, paperId);
    assertEditable(actor.role, p.status);
    const cur = flatContent(p.currentVersion);
    const next: Content = {
      ...cur,
      ...(input.format && { format: input.format }),
      ...(input.mode && { mode: input.mode }),
      ...(input.contentHtml !== undefined && { contentHtml: cleanHtml(input.contentHtml) }),
      ...(input.sectionAHtml !== undefined && { sectionAHtml: cleanHtml(input.sectionAHtml) }),
      ...(input.sectionBHtml !== undefined && { sectionBHtml: cleanHtml(input.sectionBHtml) }),
      ...(input.sectionCHtml !== undefined && { sectionCHtml: cleanHtml(input.sectionCHtml) }),
      ...(input.instructions !== undefined && { instructions: input.instructions }),
      ...(input.totalMarks !== undefined && { totalMarks: input.totalMarks }),
      ...(input.durationMinutes !== undefined && { durationMinutes: input.durationMinutes }),
    };
    const fields = (Object.keys(input) as (keyof ContentInput)[]).filter((k) => k !== "note" && input[k] !== undefined);
    await changeContent(tx, actor, p, next, { note: input.note, freeze: isModification });
    if (isModification) {
      await tx.paper.update({ where: { id: paperId }, data: { status: "UNDER_MODIFICATION", revisionCount: { increment: 1 } } });
    }
    await writeAudit(tx, {
      actor,
      action: isModification ? "PAPER_EDITED" : "PAPER_DRAFT_SAVED",
      entity: "Paper",
      entityId: paperId,
      details: { subject: p.exam.course.code, fields, note: input.note },
    });
    return reload(tx, paperId);
  });
}

// FR-8 / FR-13: upload PDF/Word for a paper.
export async function attachFile(actor: Actor, paperId: string, file: File) {
  // Check access and state before accepting the upload, then re-check under the lock.
  assertEditable(actor.role, (await getPaper(actor, paperId)).status);
  const stored = await saveUpload(file, actor.id); // object storage: outside the transaction
  const isModification = actor.role !== "SETTER";
  return withTx(async (tx) => {
    const p = await lockVisible(tx, actor, paperId);
    assertEditable(actor.role, p.status);
    const next: Content = { ...flatContent(p.currentVersion), fileId: stored.id, format: "FILE" };
    await changeContent(tx, actor, p, next, { note: isModification ? "Uploaded revised file" : "", freeze: isModification });
    if (isModification) {
      await tx.paper.update({ where: { id: paperId }, data: { status: "UNDER_MODIFICATION", revisionCount: { increment: 1 } } });
    }
    await writeAudit(tx, {
      actor,
      action: "PAPER_FILE_UPLOADED",
      entity: "Paper",
      entityId: paperId,
      details: { subject: p.exam.course.code, fileId: stored.id, sizeBytes: stored.sizeBytes, sha256: stored.sha256 },
    });
    return reload(tx, paperId);
  });
}

// FR-11: submission freezes the setter's draft as the submitted version.
export async function submitPaper(actor: Actor, paperId: string) {
  return withTx(async (tx) => {
    const p = await lockVisible(tx, actor, paperId);
    const state = paperState(p);
    if (state.setterId !== actor.id) throw notFound();
    assertTransition(p.status, "SUBMITTED");
    if (!hasContent(state)) throw new HttpError(400, "Paper has no content — write it in the editor or upload a file first");
    const now = new Date();
    const isLate = now > p.exam.submissionDeadline;
    if (p.currentVersion && !p.currentVersion.frozenAt) {
      await tx.paperVersion.update({ where: { id: p.currentVersion.id }, data: { frozenAt: now } });
    }
    await tx.paper.update({ where: { id: paperId }, data: { status: "SUBMITTED", submittedAt: now, isLate } });
    await writeAudit(tx, { actor, action: "PAPER_SUBMITTED", entity: "Paper", entityId: paperId, details: { subject: p.exam.course.code, isLate } });
    return reload(tx, paperId);
  });
}

// FR-13 / FR-17: Controller, or Typist with delegation. Freezes which version centres get.
export async function sendToCentres(actor: Actor, paperId: string) {
  return withTx(async (tx) => {
    const p = await lockVisible(tx, actor, paperId);
    const state = paperState(p);
    assertCanSend(actor, state);
    if (!canSendFromStatus(p.status)) throw new HttpError(409, `Paper cannot be sent while ${p.status}`);
    if (!hasContent(state)) throw new HttpError(400, "Paper has no content");
    if (p.centres.length === 0) throw new HttpError(400, "Assign at least one centre before sending");
    await tx.paper.update({
      where: { id: paperId },
      data: { status: "SENT_TO_CENTRE", sentAt: new Date(), sentVersionId: p.currentVersionId },
    });
    await writeAudit(tx, {
      actor,
      action: "PAPER_SENT_TO_CENTRE",
      entity: "Paper",
      entityId: paperId,
      details: { subject: p.exam.course.code, centres: p.centres.map((c) => c.centre.code), version: p.currentVersion?.number },
    });
    return reload(tx, paperId);
  });
}

// ---------- Controller management ----------

// Shared prelude for Controller commands: lock, load, reject archived papers.
export async function controllerCommand(actor: Actor, paperId: string, fn: (tx: Tx, p: PaperFull) => Promise<void>) {
  if (actor.role !== "CONTROLLER") throw new HttpError(403, "You do not have access to this resource");
  return withTx(async (tx) => {
    const p = await lockVisible(tx, actor, paperId);
    if (p.status === "ARCHIVED") throw new HttpError(423, "Archived papers are permanently locked");
    await fn(tx, p);
    return reload(tx, paperId);
  });
}

// FR-7 + FR-13 delegation. Changing the typist revokes the old assignment (history is kept);
// changing only the delegation flag updates the active assignment.
export function assignTypist(actor: Actor, paperId: string, typistId: string | null, canSend: boolean) {
  return controllerCommand(actor, paperId, async (tx, p) => {
    if (typistId) {
      const t = await tx.user.findUnique({ where: { id: typistId } });
      if (!t || t.role !== "TYPIST" || !t.isActive) throw new HttpError(400, "Selected user is not an active Typist");
    }
    if (p.status === "USED") throw new HttpError(423, "Paper is locked after use");
    const { typistId: prevId, typistCanSend: prevCanSend } = paperState(p);
    const nextCanSend = typistId ? canSend : false;
    const now = new Date();
    if (typistId !== prevId) {
      await tx.paperAssignment.updateMany({ where: { paperId: p.id, role: "TYPIST", revokedAt: null }, data: { revokedAt: now } });
      if (typistId) {
        await tx.paperAssignment.create({ data: { paperId: p.id, userId: typistId, role: "TYPIST", canSend: nextCanSend, assignedById: actor.id } });
      }
      await writeAudit(tx, { actor, action: "TYPIST_ASSIGNED", entity: "Paper", entityId: p.id, details: { from: prevId, to: typistId } });
    } else if (typistId && nextCanSend !== prevCanSend) {
      await tx.paperAssignment.updateMany({ where: { paperId: p.id, role: "TYPIST", revokedAt: null }, data: { canSend: nextCanSend } });
    }
    if (nextCanSend !== prevCanSend) {
      await writeAudit(tx, { actor, action: "DELEGATION_CHANGED", entity: "Paper", entityId: p.id, details: { typistId, canSendToCentre: canSend } });
    }
  });
}

export function recallPaper(actor: Actor, paperId: string) {
  return controllerCommand(actor, paperId, async (tx, p) => {
    assertTransition(p.status, "UNDER_MODIFICATION");
    if (p.centres.some((c) => c.firstAccessAt || c.downloadCount > 0)) throw new HttpError(409, "A centre has already accessed this paper");
    await tx.paper.update({ where: { id: p.id }, data: { status: "UNDER_MODIFICATION", sentAt: null, sentVersionId: null } });
    await writeAudit(tx, { actor, action: "PAPER_RECALLED", entity: "Paper", entityId: p.id });
  });
}

// FR-21
export function archivePaper(actor: Actor, paperId: string) {
  return controllerCommand(actor, paperId, async (tx, p) => {
    assertTransition(p.status, "ARCHIVED");
    await tx.paper.update({ where: { id: p.id }, data: { status: "ARCHIVED", archivedAt: new Date(), releasedAsModel: false } });
    await writeAudit(tx, { actor, action: "PAPER_ARCHIVED", entity: "Paper", entityId: p.id, details: { subject: p.exam.course.code } });
  });
}

// FR-22
export function setModelRelease(actor: Actor, paperId: string, released: boolean) {
  return controllerCommand(actor, paperId, async (tx, p) => {
    if (p.status !== "USED") throw new HttpError(409, "Only USED papers can be released as model papers");
    if (released && p.exam.term.isCurrent) {
      throw new HttpError(409, "Papers from the current semester cannot be released as model papers");
    }
    await tx.paper.update({ where: { id: p.id }, data: { releasedAsModel: released } });
    await writeAudit(tx, { actor, action: "MODEL_RELEASE_CHANGED", entity: "Paper", entityId: p.id, details: { released } });
  });
}

// Controller detail page: the paper plus its history and the pickers' options.
export async function controllerPaperDetail(actor: Actor, paperId: string) {
  const p = await getPaper(actor, paperId);
  const [modifications, accessLogs, typists, centres, currentSemester] = await Promise.all([
    // Revisions = versions written by someone other than the setter (FR-12/FR-13).
    prisma.paperVersion.findMany({
      where: { paperId: p.id, authorRole: { not: "SETTER" } },
      orderBy: { number: "desc" },
      select: { id: true, number: true, authorRole: true, note: true, createdAt: true, author: { select: { displayName: true } } },
    }),
    prisma.accessLog.findMany({
      where: { paperId: p.id },
      orderBy: { at: "desc" },
      take: 200,
      select: { id: true, kind: true, at: true, ip: true, centre: { select: { code: true, name: true } }, version: { select: { number: true } } },
    }),
    prisma.user.findMany({ where: { role: "TYPIST", isActive: true }, select: { id: true, displayName: true, email: true } }),
    prisma.centre.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true, city: true } }),
    getCurrentSemester(),
  ]);
  return {
    paper: p,
    revisions: modifications.map((v) => ({
      id: v.id, version: v.number, editorRole: v.authorRole, note: v.note, createdAt: v.createdAt, editor: { displayName: v.author.displayName },
    })),
    accessLogs: accessLogs.map(({ version, ...l }) => ({ ...l, version: version.number })),
    options: { typists, centres },
    currentSemester,
  };
}

// ---------- Model papers (FR-22) ----------

export async function getModelPaper(paperId: string) {
  const p = await prisma.paper.findFirst({ where: { AND: [{ id: paperId }, MODEL_PAPER_SCOPE] }, include: paperInclude });
  if (!p) throw new HttpError(404, "Model paper not found");
  return p;
}

