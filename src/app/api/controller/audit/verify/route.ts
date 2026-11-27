import { ok, route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { verifyAuditChain } from "@/server/modules/audit/service";

// Recomputes the hash chain to prove no log entry was altered or removed.
export const GET = route(async () => {
  await requireUser("CONTROLLER");
  return ok(await verifyAuditChain());
});

export const dynamic = "force-dynamic";
