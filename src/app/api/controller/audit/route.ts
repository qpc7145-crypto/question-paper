import { fail, ok, route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { auditFilterFrom, listAudit } from "@/server/modules/audit/service";

// FR-25: view & filter logs. Read-only — no UPDATE/DELETE endpoints exist for audit logs.
export const GET = route(async (req: Request) => {
  await requireUser("CONTROLLER");
  const sp = new URL(req.url).searchParams;
  const page = Math.max(1, Number(sp.get("page") || 1));
  const pageSize = Math.min(200, Math.max(10, Number(sp.get("pageSize") || 50)));
  const filter = auditFilterFrom(sp);
  if (filter.from && filter.to && filter.from.slice(0, 10) > filter.to.slice(0, 10)) return fail(400, "The From date must be on or before the To date");
  return ok(await listAudit(filter, page, pageSize));
});

export const dynamic = "force-dynamic";
