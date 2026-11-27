import { HttpError } from "@/server/core/http";
import { auditStandalone } from "@/server/modules/audit/service";
import { authenticateIntegration, INTEGRATION_MODULES } from "./clients";
import { resultSystemHandlers } from "./result-system";
import { erpHandlers } from "./erp";

// Modular API layer for FR-27 (Result System) and FR-28 (ERP).
// Each module registers "METHOD path" handlers; new systems plug in by adding a module here
// and its name to INTEGRATION_MODULES (which is also the list of API-key scopes).
export type IntegrationHandler = (ctx: { req: Request; url: URL; body: unknown }) => Promise<unknown>;
export type HandlerMap = Record<string, IntegrationHandler>;

const registry: HandlerMap = {
  "GET health": async () => ({ status: "ok", modules: INTEGRATION_MODULES, time: new Date().toISOString() }),
  ...prefix("result-system", resultSystemHandlers),
  ...prefix("erp", erpHandlers),
};

function prefix(mod: string, handlers: HandlerMap): HandlerMap {
  return Object.fromEntries(
    Object.entries(handlers).map(([k, v]) => {
      const [method, path] = k.split(" ");
      return [`${method} ${mod}/${path}`, v];
    }),
  );
}

export function resolveHandler(method: string, segments: string[]) {
  const h = registry[`${method} ${segments.join("/")}`];
  if (!h) throw new HttpError(404, "Unknown integration endpoint");
  return h;
}

export const listEndpoints = () => Object.keys(registry);

export async function dispatchIntegration(req: Request, segments: string[]) {
  const caller = await authenticateIntegration(req, segments[0] ?? "");
  const handler = resolveHandler(req.method, segments);
  const body = req.method === "GET" ? null : await req.json().catch(() => ({}));
  const result = await handler({ req, url: new URL(req.url), body });
  if (req.method !== "GET") {
    await auditStandalone({
      actor: null,
      action: "INTEGRATION_CALL",
      entity: "Integration",
      entityId: segments.join("/"),
      details: { method: req.method, client: caller.name, clientId: caller.clientId },
    });
  }
  return result;
}
