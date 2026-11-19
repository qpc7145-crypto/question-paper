import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// FR-23: Setter performance
export async function setterPerformance(semester?: string) {
  const setters = await prisma.user.findMany({
    where: { role: "SETTER" },
    orderBy: { displayName: "asc" },
    include: {
      setterProfile: { select: { fullName: true, institution: true } },
      setterPapers: {
        where: { subject: { semester } },
        select: { status: true, isLate: true, revisionCount: true, submittedAt: true, subject: { select: { submissionDeadline: true, semester: true } } },
      },
    },
  });
  const now = new Date();
  return setters.map((s) => {
    const papers = s.setterPapers;
    const submitted = papers.filter((p) => p.status !== "DRAFT");
    const overdue = papers.filter((p) => p.status === "DRAFT" && p.subject.submissionDeadline < now);
    const onTime = submitted.filter((p) => !p.isLate).length;
    return {
      setterId: s.id,
      name: s.setterProfile?.fullName ?? s.displayName,
      email: s.email,
      institution: s.setterProfile?.institution ?? "",
      assigned: papers.length,
      papersSet: submitted.length,
      lateSubmissions: submitted.filter((p) => p.isLate).length,
      overdueDrafts: overdue.length,
      revisionCount: papers.reduce((a, p) => a + p.revisionCount, 0),
      onTimeRate: submitted.length ? Math.round((onTime / submitted.length) * 100) : null,
      semesters: Array.from(new Set(papers.map((p) => p.subject.semester))).join(", "),
    };
  });
}

// FR-24: Centre usage
export async function centreUsage(semester?: string) {
  const centres = await prisma.centre.findMany({
    orderBy: { code: "asc" },
    include: {
      assignments: {
        where: { paper: { subject: { semester } } },
        include: { paper: { select: { status: true, subject: { select: { code: true, title: true, semester: true, examType: true } } } } },
        orderBy: { availableFrom: "asc" },
      },
    },
  });
  return centres.map((c) => ({
    centreId: c.id,
    code: c.code,
    name: c.name,
    city: c.city,
    assignedPapers: c.assignments.length,
    downloadedPapers: c.assignments.filter((a) => a.downloadCount > 0).length,
    totalDownloads: c.assignments.reduce((a, x) => a + x.downloadCount, 0),
    rows: c.assignments.map((a) => ({
      subject: `${a.paper.subject.code} — ${a.paper.subject.title}`,
      semester: a.paper.subject.semester,
      examType: a.paper.subject.examType,
      scheduledAt: a.availableFrom,
      firstAccessAt: a.firstAccessAt,
      firstDownloadAt: a.firstDownloadAt,
      downloadCount: a.downloadCount,
      // Minutes between scheduled unlock and first download (negative is impossible by design).
      delayMinutes: a.firstDownloadAt ? Math.round((a.firstDownloadAt.getTime() - a.availableFrom.getTime()) / 60000) : null,
    })),
  }));
}

export type AuditFilter = { email?: string; role?: string; action?: string; from?: string; to?: string; entityId?: string };

export function auditWhere(f: AuditFilter): Prisma.AuditLogWhereInput {
  const to = f.to ? new Date(f.to) : undefined;
  if (to && f.to && f.to.length <= 10) to.setHours(23, 59, 59, 999); // date-only => end of day
  return {
    ...(f.email && { userEmail: { contains: f.email.toLowerCase() } }),
    ...(f.role && { role: f.role }),
    ...(f.action && { action: f.action }),
    ...(f.entityId && { entityId: f.entityId }),
    ...((f.from || to) && { at: { ...(f.from && { gte: new Date(f.from) }), ...(to && { lte: to }) } }),
  };
}

export function auditFilterFrom(sp: URLSearchParams): AuditFilter {
  return {
    email: sp.get("email") || undefined,
    role: sp.get("role") || undefined,
    action: sp.get("action") || undefined,
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
    entityId: sp.get("entityId") || undefined,
  };
}
