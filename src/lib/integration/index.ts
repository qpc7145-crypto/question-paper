import crypto from "node:crypto";
import { HttpError } from "@/lib/http";
import { resultSystemHandlers } from "./result-system";
import { erpHandlers } from "./erp";

// Modular API layer for FR-27 (Result System) and FR-28 (ERP).
// Each module registers "METHOD path" handlers; new systems plug in by adding a module here.
export type IntegrationHandler = (ctx: { req: Request; url: URL; body: unknown }) => Promise<unknown>;
export type HandlerMap = Record<string, IntegrationHandler>;

const registry: HandlerMap = {
  "GET health": async () => ({ status: "ok", modules: ["result-system", "erp"], time: new Date().toISOString() }),
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

export function authenticateIntegration(req: Request) {
  const expected = process.env.INTEGRATION_API_KEY;
  if (!expected) throw new HttpError(503, "Integration API is disabled (INTEGRATION_API_KEY not configured)");
  const given = req.headers.get("x-api-key") ?? "";
  const a = Buffer.from(given), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(401, "Invalid API key");
}

export function resolveHandler(method: string, segments: string[]) {
  const h = registry[`${method} ${segments.join("/")}`];
  if (!h) throw new HttpError(404, "Unknown integration endpoint");
  return h;
}

export const listEndpoints = () => Object.keys(registry);
