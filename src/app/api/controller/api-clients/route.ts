import { body, ok, route } from "@/server/core/http";
import { requireUser } from "@/server/auth/guard";
import { createApiClient, createClientSchema, INTEGRATION_MODULES, listApiClients } from "@/server/modules/integrations/clients";

// FR-27/FR-28: per-system API keys for the integration API.
export const GET = route(async () => {
  await requireUser("CONTROLLER");
  return ok({ clients: await listApiClients(), modules: INTEGRATION_MODULES });
});

// Returns the new key once; only its hash is stored.
export const POST = route(async (req: Request) => {
  const actor = await requireUser("CONTROLLER");
  return ok(await createApiClient(actor, await body(req, createClientSchema)), 201);
});

export const dynamic = "force-dynamic";
