import crypto from "node:crypto";
import { z } from "zod";
import { prisma, withTx } from "@/server/core/db";
import { HttpError } from "@/server/core/http";
import { writeAudit } from "@/server/modules/audit/service";
import type { Actor } from "@/server/policy";

// Integration API clients (FR-27/FR-28): one key per external system, scoped to the modules
// it may call, individually revocable. Only the key's SHA-256 is stored.

export const INTEGRATION_MODULES = ["result-system", "erp"] as const;
export type IntegrationModule = (typeof INTEGRATION_MODULES)[number];

export const createClientSchema = z.object({
  name: z.string().trim().min(2).max(100),
  scopes: z.array(z.enum(INTEGRATION_MODULES)).min(1, "Choose at least one module"),
});

const hashKey = (key: string) => crypto.createHash("sha256").update(key).digest("hex");

export type IntegrationCaller = { clientId: string | null; name: string; scopes: readonly string[] };

export async function listApiClients() {
  const clients = await prisma.apiClient.findMany({ orderBy: { createdAt: "desc" } });
  return clients.map(({ keyHash: _k, ...c }) => c);
}

export function createApiClient(actor: Actor, input: z.output<typeof createClientSchema>) {
  const key = `qpb_${crypto.randomBytes(32).toString("base64url")}`;
  return withTx(async (tx) => {
    const c = await tx.apiClient.create({
      data: { name: input.name, scopes: input.scopes, keyHash: hashKey(key), keyPrefix: key.slice(0, 12), createdById: actor.id },
    });
    await writeAudit(tx, { actor, action: "API_CLIENT_CREATED", entity: "ApiClient", entityId: c.id, details: { name: c.name, scopes: c.scopes } });
    const { keyHash: _k, ...client } = c;
    return { client, key }; // the key is shown once and never stored
  });
}

export function revokeApiClient(actor: Actor, id: string) {
  return withTx(async (tx) => {
    const c = await tx.apiClient.findUnique({ where: { id } });
    if (!c) throw new HttpError(404, "API client not found");
    if (c.revokedAt) return;
    await tx.apiClient.update({ where: { id }, data: { revokedAt: new Date() } });
    await writeAudit(tx, { actor, action: "API_CLIENT_REVOKED", entity: "ApiClient", entityId: id, details: { name: c.name } });
  });
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Resolves the x-api-key header to a caller allowed to use `module`.
export async function authenticateIntegration(req: Request, module: string): Promise<IntegrationCaller> {
  const given = req.headers.get("x-api-key") ?? "";
  // Deprecated: the single shared key from the environment keeps working (all modules)
  // until it is removed, so existing integrations do not break on upgrade.
  const legacy = process.env.INTEGRATION_API_KEY;
  if (legacy && given && safeEqual(given, legacy)) return { clientId: null, name: "INTEGRATION_API_KEY (legacy)", scopes: INTEGRATION_MODULES };

  if (!given) {
    const active = legacy ? 1 : await prisma.apiClient.count({ where: { revokedAt: null } });
    if (!active) throw new HttpError(503, "Integration API is disabled: no API clients are configured");
    throw new HttpError(401, "Missing x-api-key header");
  }
  const c = await prisma.apiClient.findUnique({ where: { keyHash: hashKey(given) } });
  if (!c || c.revokedAt) throw new HttpError(401, "Invalid API key");
  if (module !== "health" && !c.scopes.includes(module)) throw new HttpError(403, `This API key may not call ${module}`);
  // Throttled: record use at most once a minute per client.
  if (!c.lastUsedAt || Date.now() - c.lastUsedAt.getTime() > 60_000) {
    await prisma.apiClient.update({ where: { id: c.id }, data: { lastUsedAt: new Date() } });
  }
  return { clientId: c.id, name: c.name, scopes: c.scopes };
}
