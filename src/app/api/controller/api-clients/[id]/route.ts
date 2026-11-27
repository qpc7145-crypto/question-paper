import { ok, route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { revokeApiClient } from "@/server/modules/integrations/clients";

type Ctx = { params: { id: string } };

// Revoke a key: the client is kept for the audit trail but can no longer authenticate.
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const actor = await requireUser("CONTROLLER");
  await revokeApiClient(actor, params.id);
  return ok({ ok: true });
});

export const dynamic = "force-dynamic";
