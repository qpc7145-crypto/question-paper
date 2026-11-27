import { PrismaClient, type Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// A transaction handle. Inside withTx(), use ONLY this client: the app runs with
// connection_limit=1 behind pgbouncer, so a stray `prisma.` call inside a transaction
// waits for the connection the transaction itself is holding and times out.
export type Tx = Prisma.TransactionClient;

// One command = one transaction, including its audit-log entry (see writeAudit).
export function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, { maxWait: 10_000, timeout: 20_000 });
}

// Row lock for the rest of the transaction. Serialises concurrent commands on the same
// paper (two centres opening it at once, a recall racing a download, two editors).
export async function lockPaper(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT 1 FROM "Paper" WHERE "id" = ${id} FOR UPDATE`;
}
