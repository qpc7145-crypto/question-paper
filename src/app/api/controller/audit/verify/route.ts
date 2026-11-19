import { ok, route } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { verifyAuditChain } from "@/lib/audit";

// Recomputes the hash chain to prove no log entry was altered or removed.
export const GET = route(async () => {
  await requireUser("CONTROLLER");
  return ok(await verifyAuditChain());
});

export const dynamic = "force-dynamic";
