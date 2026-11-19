import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import type { AuditAction } from "@/lib/constants";
import { clientIp } from "@/lib/http";

// FR-26: append-only, hash-chained audit log.
// Each entry's hash covers its own fields plus the previous entry's hash, so any
// edit or deletion of a historical row breaks the chain and is detected by verifyAuditChain().
// The database additionally rejects UPDATE/DELETE via triggers (prisma/triggers.sql).

export const GENESIS_HASH = "0".repeat(64);

type Actor = { id: string; email: string; role: string } | null;

export type AuditInput = {
  actor: Actor;
  action: AuditAction;
  entity?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ip?: string | null;
};

function computeHash(prevHash: string, e: {
  at: string; userId: string | null; userEmail: string | null; role: string | null;
  action: string; entity: string | null; entityId: string | null; details: string; ip: string | null;
}) {
  const canonical = JSON.stringify([
    prevHash, e.at, e.userId, e.userEmail, e.role, e.action, e.entity, e.entityId, e.details, e.ip,
  ]);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

// Serialise writers inside this process so the chain never forks.
// (For multi-instance PostgreSQL deployments wrap this in pg_advisory_xact_lock.)
let queue: Promise<unknown> = Promise.resolve();

export function audit(input: AuditInput): Promise<void> {
  let ip = input.ip;
  if (ip === undefined) {
    try {
      ip = clientIp();
    } catch {
      ip = null; // called outside a request scope
    }
  }
  const run = async () => {
    const last = await prisma.auditLog.findFirst({ orderBy: { seq: "desc" }, select: { hash: true } });
    const prevHash = last?.hash ?? GENESIS_HASH;
    const at = new Date();
    const entry = {
      at: at.toISOString(),
      userId: input.actor?.id ?? null,
      userEmail: input.actor?.email ?? null,
      role: input.actor?.role ?? null,
      action: input.action,
      entity: input.entity ?? null,
      entityId: input.entityId ?? null,
      details: JSON.stringify(input.details ?? {}),
      ip: ip ?? null,
    };
    await prisma.auditLog.create({
      data: { ...entry, at, prevHash, hash: computeHash(prevHash, entry) },
    });
  };
  const p = queue.then(run, run);
  queue = p.catch(() => undefined);
  return p as Promise<void>;
}

export async function verifyAuditChain() {
  const rows = await prisma.auditLog.findMany({ orderBy: { seq: "asc" } });
  let prev = GENESIS_HASH;
  for (const r of rows) {
    const expected = computeHash(prev, {
      at: r.at.toISOString(), userId: r.userId, userEmail: r.userEmail, role: r.role,
      action: r.action, entity: r.entity, entityId: r.entityId, details: r.details, ip: r.ip,
    });
    if (r.prevHash !== prev || r.hash !== expected) {
      return { valid: false, total: rows.length, brokenAtSeq: r.seq };
    }
    prev = r.hash;
  }
  return { valid: true, total: rows.length, brokenAtSeq: null as number | null };
}
