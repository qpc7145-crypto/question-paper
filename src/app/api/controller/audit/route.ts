import { prisma } from "@/lib/db";
import { fail, ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { auditFilterFrom, auditWhere } from "@/lib/reports";
import { AUDIT_ACTIONS } from "@/lib/constants";

// Readable names for the Entity column (paper/subject code, user email, centre code) instead of internal IDs.
async function withEntityLabels<T extends { entity: string | null; entityId: string | null }>(rows: T[]) {
  const ids = (e: string) => Array.from(new Set(rows.filter((r) => r.entity === e && r.entityId).map((r) => r.entityId!)));
  const [papers, subjects, users, centres] = await Promise.all([
    prisma.paper.findMany({ where: { id: { in: ids("Paper") } }, select: { id: true, subject: { select: { code: true } } } }),
    prisma.subject.findMany({ where: { id: { in: ids("Subject") } }, select: { id: true, code: true } }),
    prisma.user.findMany({ where: { id: { in: [...ids("User"), ...ids("SuperintendentProfile")] } }, select: { id: true, email: true } }),
    prisma.centre.findMany({ where: { id: { in: ids("Centre") } }, select: { id: true, code: true } }),
  ]);
  const label = new Map<string, string>([
    ...papers.map((p) => [p.id, p.subject.code] as [string, string]),
    ...subjects.map((s) => [s.id, s.code] as [string, string]),
    ...users.map((u) => [u.id, u.email] as [string, string]),
    ...centres.map((c) => [c.id, c.code] as [string, string]),
  ]);
  return rows.map((r) => ({ ...r, entityLabel: r.entityId ? label.get(r.entityId) ?? null : null }));
}

// FR-25: view & filter logs. Read-only — no UPDATE/DELETE endpoints exist for audit logs.
export const GET = route(async (req: Request) => {
  await requireUser("CONTROLLER");
  const sp = new URL(req.url).searchParams;
  const page = Math.max(1, Number(sp.get("page") || 1));
  const pageSize = Math.min(200, Math.max(10, Number(sp.get("pageSize") || 50)));
  const filter = auditFilterFrom(sp);
  if (filter.from && filter.to && filter.from.slice(0, 10) > filter.to.slice(0, 10)) return fail(400, "The From date must be on or before the To date");
  const where = auditWhere(filter);
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { seq: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return ok({ total, page, pageSize, rows: await withEntityLabels(rows), actions: AUDIT_ACTIONS });
});

export const dynamic = "force-dynamic";
