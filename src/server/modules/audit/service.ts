import crypto from "node:crypto";
import type { Prisma, Role } from "@prisma/client";
import { prisma, withTx, type Tx } from "@/server/core/db";
import { AUDIT_ACTIONS, type AuditAction } from "@/lib/constants";
import { clientIp } from "@/server/core/http";

// FR-26: append-only, hash-chained audit log.
// Each entry's hash covers its own fields plus the previous entry's hash, so any
// edit or deletion of a historical row breaks the chain and is detected by verifyAuditChain().
// The database additionally rejects UPDATE/DELETE via triggers (prisma/triggers.sql).

export const GENESIS_HASH = "0".repeat(64);

export type AuditActor = { id: string; email: string; role: Role } | null;

export type AuditInput = {
  actor: AuditActor;
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

function requestIp(ip: string | null | undefined) {
  if (ip !== undefined) return ip;
  try {
    return clientIp();
  } catch {
    return null; // called outside a request scope (seed, scripts)
  }
}

// Appends an entry inside the caller's transaction, so the action and its audit record
// commit or roll back together. Call it as the LAST statement of the transaction: the
// advisory lock below is held until commit and serialises every audit writer
// (concurrent serverless instances must extend one linear hash chain).
export async function writeAudit(tx: Tx, input: AuditInput) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(727274)`;
  const last = await tx.auditLog.findFirst({ orderBy: { seq: "desc" }, select: { hash: true } });
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
    ip: requestIp(input.ip),
  };
  await tx.auditLog.create({ data: { ...entry, at, prevHash, hash: computeHash(prevHash, entry) } });
}

// For events that change nothing else: failed logins, logouts, downloads, exports.
export function auditStandalone(input: AuditInput) {
  return withTx((tx) => writeAudit(tx, input));
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

// ---------- Reading (FR-25) ----------

export type AuditFilter = { email?: string; role?: Role; action?: string; from?: string; to?: string; entityId?: string };

const ROLE_VALUES = ["CONTROLLER", "SETTER", "TYPIST", "SUPERINTENDENT"] as const;

// Unknown filter values match nothing instead of reaching the database as invalid enums.
export function auditFilterFrom(sp: URLSearchParams): AuditFilter & { invalid?: boolean } {
  const role = sp.get("role") || undefined;
  const action = sp.get("action") || undefined;
  const invalid = (!!role && !ROLE_VALUES.includes(role as Role)) || (!!action && !AUDIT_ACTIONS.includes(action as AuditAction));
  return {
    email: sp.get("email") || undefined,
    role: role as Role | undefined,
    action,
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
    entityId: sp.get("entityId") || undefined,
    invalid,
  };
}

export function auditWhere(f: AuditFilter & { invalid?: boolean }): Prisma.AuditLogWhereInput {
  if (f.invalid) return { seq: -1 };
  const to = f.to ? new Date(f.to) : undefined;
  if (to && f.to && f.to.length <= 10) to.setHours(23, 59, 59, 999); // date-only => end of day
  return {
    ...(f.email && { userEmail: { contains: f.email.toLowerCase() } }),
    ...(f.role && { role: f.role }),
    ...(f.action && { action: f.action }),
    ...(f.entityId && { entityId: f.entityId }),
    ...((f.from || to) && { at: { ...(f.from && { gte: new Date(f.from) }), ...(to && { lte: to }) } }),
  };
}

// Readable names for the Entity column (paper/subject code, user email, centre code) instead of internal IDs.
async function withEntityLabels<T extends { entity: string | null; entityId: string | null }>(rows: T[]) {
  const ids = (e: string) => Array.from(new Set(rows.filter((r) => r.entity === e && r.entityId).map((r) => r.entityId!)));
  const [papers, subjects, users, centres] = await Promise.all([
    prisma.paper.findMany({ where: { id: { in: ids("Paper") } }, select: { id: true, exam: { select: { course: { select: { code: true } } } } } }),
    // Subjects are exams now; exam ids are the old subject ids, so old log rows still resolve.
    prisma.exam.findMany({ where: { id: { in: ids("Subject") } }, select: { id: true, course: { select: { code: true } } } }),
    prisma.user.findMany({ where: { id: { in: [...ids("User"), ...ids("SuperintendentProfile"), ...ids("SetterProfile")] } }, select: { id: true, email: true } }),
    prisma.centre.findMany({ where: { id: { in: ids("Centre") } }, select: { id: true, code: true } }),
  ]);
  const label = new Map<string, string>([
    ...papers.map((p) => [p.id, p.exam.course.code] as [string, string]),
    ...subjects.map((s) => [s.id, s.course.code] as [string, string]),
    ...users.map((u) => [u.id, u.email] as [string, string]),
    ...centres.map((c) => [c.id, c.code] as [string, string]),
  ]);
  return rows.map((r) => ({ ...r, entityLabel: r.entityId ? label.get(r.entityId) ?? null : null }));
}

export async function listAudit(filter: ReturnType<typeof auditFilterFrom>, page: number, pageSize: number) {
  const where = auditWhere(filter);
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { seq: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { total, page, pageSize, rows: await withEntityLabels(rows), actions: AUDIT_ACTIONS };
}
