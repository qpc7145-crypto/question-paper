import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/server";
import { HttpError } from "@/lib/http";
import { assertEditable, assertTransition, canSendFromStatus, hasContent } from "@/lib/lifecycle";
import { cleanHtml } from "@/lib/sanitize";
import { paperInclude } from "@/lib/serializers";
import { saveUpload } from "@/lib/storage";

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

export async function loadPaper(id: string) {
  const p = await prisma.paper.findUnique({ where: { id }, include: paperInclude });
  if (!p) throw new HttpError(404, "Paper not found");
  return p;
}

function snapshot(p: { format: string; mode: string; contentHtml: string; sectionAHtml: string; sectionBHtml: string; sectionCHtml: string; instructions: string; fileId: string | null; totalMarks: number | null; durationMinutes: number | null }) {
  return JSON.stringify({
    format: p.format, mode: p.mode, contentHtml: p.contentHtml, sectionAHtml: p.sectionAHtml,
    sectionBHtml: p.sectionBHtml, sectionCHtml: p.sectionCHtml, instructions: p.instructions,
    fileId: p.fileId, totalMarks: p.totalMarks, durationMinutes: p.durationMinutes,
  });
}

// Shared content update for Setter (draft), Controller (FR-12) and Typist (FR-13).
export async function updateContent(paperId: string, actor: SessionUser, input: ContentInput) {
  const p = await loadPaper(paperId);
  assertEditable(actor.role, p.status);
  const isModification = actor.role !== "SETTER";

  const data = {
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

  await prisma.$transaction(async (tx) => {
    if (isModification) {
      await tx.paperRevision.create({
        data: { paperId, editorId: actor.id, editorRole: actor.role, note: input.note ?? "", snapshot: snapshot(p) },
      });
    }
    await tx.paper.update({
      where: { id: paperId },
      data: {
        ...data,
        ...(isModification && { status: "UNDER_MODIFICATION", revisionCount: { increment: 1 } }),
      },
    });
  });

  await audit({
    actor,
    action: isModification ? "PAPER_EDITED" : "PAPER_DRAFT_SAVED",
    entity: "Paper",
    entityId: paperId,
    details: { subject: p.subject.code, fields: Object.keys(data), note: input.note },
  });
  return loadPaper(paperId);
}

export async function attachFile(paperId: string, actor: SessionUser, file: File) {
  const p = await loadPaper(paperId);
  assertEditable(actor.role, p.status);
  const stored = await saveUpload(file, actor.id);
  const isModification = actor.role !== "SETTER";
  await prisma.$transaction(async (tx) => {
    if (isModification) {
      await tx.paperRevision.create({
        data: { paperId, editorId: actor.id, editorRole: actor.role, note: "Uploaded revised file", snapshot: snapshot(p) },
      });
    }
    await tx.paper.update({
      where: { id: paperId },
      data: {
        fileId: stored.id,
        format: "FILE",
        ...(isModification && { status: "UNDER_MODIFICATION", revisionCount: { increment: 1 } }),
      },
    });
  });
  await audit({
    actor,
    action: "PAPER_FILE_UPLOADED",
    entity: "Paper",
    entityId: paperId,
    details: { subject: p.subject.code, fileId: stored.id, sizeBytes: stored.sizeBytes, sha256: stored.sha256 },
  });
  return loadPaper(paperId);
}

export async function submitPaper(paperId: string, actor: SessionUser) {
  const p = await loadPaper(paperId);
  if (p.setterId !== actor.id) throw new HttpError(404, "Paper not found");
  assertTransition(p.status, "SUBMITTED");
  if (!hasContent(p)) throw new HttpError(400, "Paper has no content — write it in the editor or upload a file first");
  const now = new Date();
  const isLate = now > p.subject.submissionDeadline;
  await prisma.paper.update({ where: { id: paperId }, data: { status: "SUBMITTED", submittedAt: now, isLate } });
  await audit({ actor, action: "PAPER_SUBMITTED", entity: "Paper", entityId: paperId, details: { subject: p.subject.code, isLate } });
  return loadPaper(paperId);
}

// Controller, or Typist with delegation (FR-13).
export async function sendToCentres(paperId: string, actor: SessionUser) {
  const p = await loadPaper(paperId);
  if (actor.role === "TYPIST" && (p.typistId !== actor.id || !p.typistCanSend)) {
    throw new HttpError(403, "You are not delegated to send this paper");
  }
  if (!canSendFromStatus(p.status)) throw new HttpError(409, `Paper cannot be sent while ${p.status}`);
  if (!hasContent(p)) throw new HttpError(400, "Paper has no content");
  if (p.centres.length === 0) throw new HttpError(400, "Assign at least one centre before sending");
  await prisma.paper.update({ where: { id: paperId }, data: { status: "SENT_TO_CENTRE", sentAt: new Date() } });
  await audit({
    actor,
    action: "PAPER_SENT_TO_CENTRE",
    entity: "Paper",
    entityId: paperId,
    details: { subject: p.subject.code, centres: p.centres.map((c) => c.centre.code) },
  });
  return loadPaper(paperId);
}
