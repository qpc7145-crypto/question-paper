// Role-specific views of a paper (FR-14). API routes MUST return one of these
// rather than raw Prisma rows, so hidden fields never reach a restricted role.
//
// The database stores Exam/Course/Term, PaperVersion and PaperAssignment; these views keep
// the API's original shape ("subject", flat content fields, "setter", "typist"), so the UI
// and the demo mode are unaffected by the storage model.
import type { Prisma } from "@prisma/client";
import { termLabel } from "@/server/modules/academics/terms";

export const ACTIVE = { revokedAt: null } as const;

export const examInclude = { course: true, term: true } satisfies Prisma.ExamInclude;

const versionInclude = {
  file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true } },
} satisfies Prisma.PaperVersionInclude;

export const paperInclude = {
  exam: { include: examInclude },
  currentVersion: { include: versionInclude },
  sentVersion: { include: versionInclude },
  assignments: {
    where: ACTIVE,
    include: { user: { select: { id: true, email: true, displayName: true, setterProfile: { select: { fullName: true } } } } },
  },
  centres: { include: { centre: { select: { id: true, code: true, name: true, city: true } } } },
} satisfies Prisma.PaperInclude;

export type PaperFull = Prisma.PaperGetPayload<{ include: typeof paperInclude }>;
export type ExamFull = Prisma.ExamGetPayload<{ include: typeof examInclude }>;
export type VersionFull = NonNullable<PaperFull["currentVersion"]>;

// ---------- Building blocks ----------

export const subjectView = (e: ExamFull) => ({
  id: e.id,
  code: e.course.code,
  title: e.title,
  semester: termLabel(e.term),
  examType: e.examType,
  examDate: e.examDate,
  submissionDeadline: e.submissionDeadline,
});

export type VersionContent = { contentHtml?: string; sections?: { A?: string; B?: string; C?: string } };

// Flat content fields, as stored before versions existed and as the editor uses them.
export function flatContent(v: Pick<VersionFull, "format" | "mode" | "content" | "instructions" | "totalMarks" | "durationMinutes" | "fileId"> | null) {
  const c = (v?.content ?? {}) as VersionContent;
  return {
    format: v?.format ?? "RICH_TEXT",
    mode: v?.mode ?? "FREE",
    contentHtml: c.contentHtml ?? "",
    sectionAHtml: c.sections?.A ?? "",
    sectionBHtml: c.sections?.B ?? "",
    sectionCHtml: c.sections?.C ?? "",
    instructions: v?.instructions ?? "",
    totalMarks: v?.totalMarks ?? null,
    durationMinutes: v?.durationMinutes ?? null,
    fileId: v?.fileId ?? null,
  };
}

export const activeSetter = (p: PaperFull) => p.assignments.find((a) => a.role === "SETTER") ?? null;
export const activeTypist = (p: PaperFull) => p.assignments.find((a) => a.role === "TYPIST") ?? null;

// The fields the lifecycle rules, the renderer and the services work with.
export function paperState(p: PaperFull) {
  const setter = activeSetter(p);
  const typist = activeTypist(p);
  return {
    ...flatContent(p.currentVersion),
    subject: subjectView(p.exam),
    setterId: setter?.userId ?? null,
    typistId: typist?.userId ?? null,
    typistCanSend: typist?.canSend ?? false,
  };
}

// What a centre receives: the version frozen at send time.
export function sentState(p: PaperFull) {
  return { ...flatContent(p.sentVersion ?? p.currentVersion), subject: subjectView(p.exam) };
}

const contentView = (p: PaperFull) => {
  const { fileId: _f, ...content } = flatContent(p.currentVersion);
  const file = p.currentVersion?.file;
  return {
    ...content,
    // Original filename withheld from non-controllers — it can reveal who prepared it.
    file: file ? { name: `${p.exam.course.code}-paper.${file.originalName.split(".").pop()}`, sizeBytes: file.sizeBytes } : null,
  };
};

// ---------- Views ----------

export function controllerPaperView(p: PaperFull) {
  const setter = activeSetter(p);
  const typist = activeTypist(p);
  const file = p.currentVersion?.file;
  return {
    id: p.id,
    status: p.status,
    subject: subjectView(p.exam),
    ...contentView(p),
    file: file ? { name: file.originalName, sizeBytes: file.sizeBytes, uploadedAt: file.createdAt } : null,
    setter: setter
      ? { id: setter.user.id, email: setter.user.email, name: setter.user.setterProfile?.fullName ?? setter.user.displayName }
      : null,
    typist: typist ? { id: typist.user.id, email: typist.user.email, name: typist.user.displayName } : null,
    typistCanSend: typist?.canSend ?? false,
    centres: p.centres.map((c) => ({
      centreId: c.centre.id,
      code: c.centre.code,
      name: c.centre.name,
      city: c.centre.city,
      availableFrom: c.availableFrom,
      firstAccessAt: c.firstAccessAt,
      firstDownloadAt: c.firstDownloadAt,
      downloadCount: c.downloadCount,
    })),
    revisionCount: p.revisionCount,
    submittedAt: p.submittedAt,
    isLate: p.isLate,
    sentAt: p.sentAt,
    usedAt: p.usedAt,
    archivedAt: p.archivedAt,
    releasedAsModel: p.releasedAsModel,
    updatedAt: p.updatedAt,
  };
}

// Setter: no centres, no typist, no delegation, no usage data.
export function setterPaperView(p: PaperFull) {
  return {
    id: p.id,
    status: p.status === "ARCHIVED" ? "USED" : p.status, // archive layer is invisible to setters
    subject: subjectView(p.exam),
    ...contentView(p),
    submittedAt: p.submittedAt,
    isLate: p.isLate,
    editable: p.status === "DRAFT",
  };
}

// Typist: no setter identity of any kind.
export function typistPaperView(p: PaperFull) {
  return {
    id: p.id,
    status: p.status,
    subject: subjectView(p.exam),
    ...contentView(p),
    canSend: activeTypist(p)?.canSend ?? false,
    centres: p.centres.map((c) => ({ code: c.centre.code, name: c.centre.name, city: c.centre.city, availableFrom: c.availableFrom })),
    revisionCount: p.revisionCount,
    submittedAt: p.submittedAt,
    sentAt: p.sentAt,
    editable: p.status === "SUBMITTED" || p.status === "UNDER_MODIFICATION",
  };
}

export const centreAssignmentInclude = {
  paper: { include: { exam: { include: examInclude }, sentVersion: { select: { totalMarks: true, durationMinutes: true } } } },
} satisfies Prisma.PaperCentreInclude;

// Centre: schedule metadata only; content is only served by the time-gated download.
export function centreAssignmentView(
  a: Prisma.PaperCentreGetPayload<{ include: typeof centreAssignmentInclude }>,
  now: Date,
) {
  const s = subjectView(a.paper.exam);
  return {
    paperId: a.paperId,
    subject: { code: s.code, title: s.title, semester: s.semester, examType: s.examType },
    examDate: s.examDate,
    availableFrom: a.availableFrom,
    durationMinutes: a.paper.sentVersion?.durationMinutes ?? null,
    totalMarks: a.paper.sentVersion?.totalMarks ?? null,
    unlocked: now >= a.availableFrom,
    downloadCount: a.downloadCount,
    firstAccessAt: a.firstAccessAt,
    firstDownloadAt: a.firstDownloadAt,
    // Per centre: "used" means THIS centre opened it. The paper-level USED status is set by
    // whichever centre opens it first and says nothing about the others.
    status: a.firstAccessAt || a.downloadCount > 0 ? "USED" : "SENT_TO_CENTRE",
  };
}

// Role -> view, for routes shared by several roles.
export function viewFor(role: string, p: PaperFull) {
  if (role === "CONTROLLER") return controllerPaperView(p);
  if (role === "TYPIST") return typistPaperView(p);
  return setterPaperView(p);
}

// List rows: drop the heavy content fields.
export function listView<T extends { contentHtml: string; sectionAHtml: string; sectionBHtml: string; sectionCHtml: string }>(v: T) {
  const { contentHtml: _a, sectionAHtml: _b, sectionBHtml: _c, sectionCHtml: _d, ...rest } = v;
  return rest;
}
