// Role-specific views of a paper (FR-14). API routes MUST return one of these
// rather than raw Prisma rows, so hidden fields never reach a restricted role.
import type { Prisma } from "@prisma/client";

export const paperInclude = {
  subject: true,
  file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true } },
  setter: { select: { id: true, email: true, displayName: true, setterProfile: { select: { fullName: true } } } },
  typist: { select: { id: true, email: true, displayName: true } },
  centres: { include: { centre: { select: { id: true, code: true, name: true, city: true } } } },
} satisfies Prisma.PaperInclude;

export type PaperFull = Prisma.PaperGetPayload<{ include: typeof paperInclude }>;

const subjectView = (s: PaperFull["subject"]) => ({
  id: s.id,
  code: s.code,
  title: s.title,
  semester: s.semester,
  examType: s.examType,
  examDate: s.examDate,
  submissionDeadline: s.submissionDeadline,
});

const contentView = (p: PaperFull) => ({
  format: p.format,
  mode: p.mode,
  contentHtml: p.contentHtml,
  sectionAHtml: p.sectionAHtml,
  sectionBHtml: p.sectionBHtml,
  sectionCHtml: p.sectionCHtml,
  instructions: p.instructions,
  totalMarks: p.totalMarks,
  durationMinutes: p.durationMinutes,
  // Original filename withheld from non-controllers — it can reveal who prepared it.
  file: p.file ? { name: `${p.subject.code}-paper.${p.file.originalName.split(".").pop()}`, sizeBytes: p.file.sizeBytes } : null,
});

export function controllerPaperView(p: PaperFull) {
  return {
    id: p.id,
    status: p.status,
    subject: subjectView(p.subject),
    ...contentView(p),
    file: p.file ? { name: p.file.originalName, sizeBytes: p.file.sizeBytes, uploadedAt: p.file.createdAt } : null,
    setter: { id: p.setter.id, email: p.setter.email, name: p.setter.setterProfile?.fullName ?? p.setter.displayName },
    typist: p.typist ? { id: p.typist.id, email: p.typist.email, name: p.typist.displayName } : null,
    typistCanSend: p.typistCanSend,
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
    subject: subjectView(p.subject),
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
    subject: subjectView(p.subject),
    ...contentView(p),
    canSend: p.typistCanSend,
    centres: p.centres.map((c) => ({ code: c.centre.code, name: c.centre.name, city: c.centre.city, availableFrom: c.availableFrom })),
    revisionCount: p.revisionCount,
    submittedAt: p.submittedAt,
    sentAt: p.sentAt,
    editable: p.status === "SUBMITTED" || p.status === "UNDER_MODIFICATION",
  };
}

// Centre: schedule metadata only; content is only served by the time-gated download.
export function centreAssignmentView(
  a: Prisma.PaperCentreGetPayload<{ include: { paper: { include: { subject: true } } } }>,
  now: Date,
) {
  return {
    paperId: a.paperId,
    subject: {
      code: a.paper.subject.code,
      title: a.paper.subject.title,
      semester: a.paper.subject.semester,
      examType: a.paper.subject.examType,
    },
    availableFrom: a.availableFrom,
    durationMinutes: a.paper.durationMinutes,
    totalMarks: a.paper.totalMarks,
    unlocked: now >= a.availableFrom,
    downloadCount: a.downloadCount,
    firstDownloadAt: a.firstDownloadAt,
    status: a.paper.status === "USED" ? "USED" : "SENT_TO_CENTRE",
  };
}
