import { prisma } from "@/server/core/db";
import { getCurrentSemester, listSemesters } from "@/server/modules/settings/service";
import { termLabel, termWhere } from "@/server/modules/academics/terms";
import { PAPER_STATUSES } from "@/lib/constants";

const exam = { select: { title: true, examType: true, submissionDeadline: true, course: { select: { code: true } }, term: true } } as const;

// FR-23: Setter performance — over the papers each setter currently holds.
export async function setterPerformance(semester?: string) {
  const setters = await prisma.user.findMany({
    where: { role: "SETTER" },
    orderBy: { displayName: "asc" },
    include: {
      setterProfile: { select: { fullName: true, institution: true } },
      assignments: {
        where: { role: "SETTER", revokedAt: null, paper: { exam: { term: termWhere(semester) } } },
        select: { paper: { select: { status: true, isLate: true, revisionCount: true, exam } } },
      },
    },
  });
  const now = new Date();
  return setters.map((s) => {
    const papers = s.assignments.map((a) => a.paper);
    const submitted = papers.filter((p) => p.status !== "DRAFT");
    const overdue = papers.filter((p) => p.status === "DRAFT" && p.exam.submissionDeadline < now);
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
      semesters: Array.from(new Set(papers.map((p) => termLabel(p.exam.term)))).join(", "),
    };
  });
}

// FR-24: Centre usage
export async function centreUsage(semester?: string) {
  const centres = await prisma.centre.findMany({
    orderBy: { code: "asc" },
    include: {
      assignments: {
        where: { paper: { exam: { term: termWhere(semester) } } },
        include: { paper: { select: { status: true, exam } } },
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
      subject: `${a.paper.exam.course.code} — ${a.paper.exam.title}`,
      semester: termLabel(a.paper.exam.term),
      examType: a.paper.exam.examType,
      scheduledAt: a.availableFrom,
      firstAccessAt: a.firstAccessAt,
      firstDownloadAt: a.firstDownloadAt,
      downloadCount: a.downloadCount,
      // Minutes between scheduled unlock and first download (negative is impossible by design).
      delayMinutes: a.firstDownloadAt ? Math.round((a.firstDownloadAt.getTime() - a.availableFrom.getTime()) / 60000) : null,
    })),
  }));
}

// Controller dashboard: status counts, overdue drafts and the next unlocks.
export async function controllerDashboard(semester?: string) {
  const now = new Date();
  const visible = { assignments: { some: { role: "SETTER" as const, revokedAt: null } }, exam: { term: termWhere(semester) } };
  const [byStatus, overdue, upcoming, users, centres, semesters, currentSemester] = await Promise.all([
    prisma.paper.groupBy({ by: ["status"], where: visible, _count: true }),
    prisma.paper.count({ where: { ...visible, status: "DRAFT", exam: { term: termWhere(semester), submissionDeadline: { lt: now } } } }),
    prisma.paperCentre.findMany({
      where: { availableFrom: { gte: now }, paper: visible },
      orderBy: { availableFrom: "asc" },
      take: 8,
      include: { centre: { select: { code: true } }, paper: { select: { id: true, status: true, exam: { select: { title: true, course: { select: { code: true } } } } } } },
    }),
    prisma.user.groupBy({ by: ["role"], where: { isActive: true }, _count: true }),
    prisma.centre.count(),
    listSemesters(),
    getCurrentSemester(),
  ]);
  const counts = Object.fromEntries(PAPER_STATUSES.map((s) => [s, 0])) as Record<string, number>;
  byStatus.forEach((r) => (counts[r.status] = r._count));
  return {
    counts,
    overdue,
    upcoming: upcoming.map((u) => ({
      paperId: u.paper.id,
      code: u.paper.exam.course.code,
      title: u.paper.exam.title,
      status: u.paper.status,
      centre: u.centre.code,
      availableFrom: u.availableFrom,
    })),
    users: Object.fromEntries(users.map((u) => [u.role, u._count])),
    centres,
    semesters,
    currentSemester,
  };
}
