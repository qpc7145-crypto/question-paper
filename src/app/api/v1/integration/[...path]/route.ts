import { audit } from "@/lib/audit";
import { ok, route } from "@/lib/http";
import { authenticateIntegration, resolveHandler } from "@/lib/integration";

type Ctx = { params: { path: string[] } };

async function dispatch(req: Request, { params }: Ctx) {
  authenticateIntegration(req);
  const handler = resolveHandler(req.method, params.path);
  const body = req.method === "GET" ? null : await req.json().catch(() => ({}));
  const result = await handler({ req, url: new URL(req.url), body });
  if (req.method !== "GET") {
    await audit({ actor: null, action: "INTEGRATION_CALL", entity: "Integration", entityId: params.path.join("/"), details: { method: req.method } });
  }
  return ok(result);
}

export const GET = route(dispatch);
export const POST = route(dispatch);

export const dynamic = "force-dynamic";
