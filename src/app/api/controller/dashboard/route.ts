import { prisma } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { getCurrentSemester, listSemesters } from "@/lib/settings";
import { PAPER_STATUSES } from "@/lib/constants";

export const GET = route(async (req: Request) => {
  await requireUser("CONTROLLER");
  const semester = new URL(req.url).searchParams.get("semester") || undefined;
  const now = new Date();
  const [byStatus, overdue, upcoming, users, centres, recent] = await Promise.all([
    prisma.paper.groupBy({ by: ["status"], where: { subject: { semester } }, _count: true }),
    prisma.paper.count({ where: { status: "DRAFT", subject: { semester, submissionDeadline: { lt: now } } } }),
    prisma.paperCentre.findMany({
      where: { availableFrom: { gte: now }, paper: { subject: { semester } } },
      orderBy: { availableFrom: "asc" },
      take: 8,
      include: { centre: { select: { code: true } }, paper: { select: { id: true, status: true, subject: { select: { code: true, title: true } } } } },
    }),
    prisma.user.groupBy({ by: ["role"], where: { isActive: true }, _count: true }),
    prisma.centre.count(),
    prisma.auditLog.findMany({ orderBy: { seq: "desc" }, take: 8, select: { seq: true, at: true, action: true, userEmail: true, role: true } }),
  ]);
  const counts = Object.fromEntries(PAPER_STATUSES.map((s) => [s, 0])) as Record<string, number>;
  byStatus.forEach((r) => (counts[r.status] = r._count));
  return ok({
    counts,
    overdue,
    upcoming: upcoming.map((u) => ({
      paperId: u.paper.id,
      code: u.paper.subject.code,
      title: u.paper.subject.title,
      status: u.paper.status,
      centre: u.centre.code,
      availableFrom: u.availableFrom,
    })),
    users: Object.fromEntries(users.map((u) => [u.role, u._count])),
    centres,
    recent,
    semesters: await listSemesters(),
    currentSemester: await getCurrentSemester(),
  });
});

export const dynamic = "force-dynamic";
