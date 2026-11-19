import { prisma } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { auditFilterFrom, auditWhere } from "@/lib/reports";
import { AUDIT_ACTIONS } from "@/lib/constants";

// FR-25: view & filter logs. Read-only — no UPDATE/DELETE endpoints exist for audit logs.
export const GET = route(async (req: Request) => {
  await requireUser("CONTROLLER");
  const sp = new URL(req.url).searchParams;
  const page = Math.max(1, Number(sp.get("page") || 1));
  const pageSize = Math.min(200, Math.max(10, Number(sp.get("pageSize") || 50)));
  const where = auditWhere(auditFilterFrom(sp));
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { seq: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return ok({ total, page, pageSize, rows, actions: AUDIT_ACTIONS });
});

export const dynamic = "force-dynamic";
