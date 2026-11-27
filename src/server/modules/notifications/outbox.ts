import { prisma, type Tx } from "@/server/core/db";
import { sendMail } from "@/server/infra/mailer";

// Email outbox. A message is written in the same transaction as the event that causes it,
// then delivered by deliverOutbox() (called from the cron route). A mail-server outage
// therefore never fails or loses the action, and delivery is retried with backoff.
//
// Not used for password-reset OTPs: those are secrets (they must not sit in a table) and are
// only useful within minutes, so they are sent directly in the request.

const MAX_ATTEMPTS = 8;
const LEASE_MS = 5 * 60_000; // a claimed message is retried by another worker after this
const BATCH = 50;

export type OutgoingEmail = { kind: string; to: string; subject: string; body: string; dedupeKey?: string };

// Queues emails; a message whose dedupeKey was already queued is skipped. Returns how many were new.
export async function enqueueEmails(tx: Tx | typeof prisma, emails: OutgoingEmail[]) {
  if (!emails.length) return 0;
  const r = await tx.outboxMessage.createMany({
    data: emails.map((e) => ({ kind: e.kind, recipient: e.to, subject: e.subject, body: e.body, dedupeKey: e.dedupeKey })),
    skipDuplicates: true,
  });
  return r.count;
}

// Claims due messages (safe with concurrent workers: SKIP LOCKED + a lease) and sends them.
export async function deliverOutbox(limit = BATCH) {
  const claimed = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "OutboxMessage"
      WHERE "sentAt" IS NULL AND "runAfter" <= now() AND "attempts" < ${MAX_ATTEMPTS}
      ORDER BY "runAfter" LIMIT ${limit} FOR UPDATE SKIP LOCKED`;
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    await tx.outboxMessage.updateMany({
      where: { id: { in: ids } },
      data: { attempts: { increment: 1 }, runAfter: new Date(Date.now() + LEASE_MS) },
    });
    return tx.outboxMessage.findMany({ where: { id: { in: ids } } });
  });

  let sent = 0, failed = 0;
  for (const m of claimed) {
    try {
      await sendMail(m.recipient, m.subject, m.body);
      await prisma.outboxMessage.update({ where: { id: m.id }, data: { sentAt: new Date(), lastError: null } });
      sent++;
    } catch (e) {
      // Exponential backoff: 2, 4, 8 ... minutes, capped at 12 hours.
      const delayMs = Math.min(2 ** m.attempts * 60_000, 12 * 3600_000);
      await prisma.outboxMessage.update({
        where: { id: m.id },
        data: { lastError: String((e as Error).message ?? e).slice(0, 500), runAfter: new Date(Date.now() + delayMs) },
      });
      failed++;
    }
  }
  return { claimed: claimed.length, sent, failed };
}
