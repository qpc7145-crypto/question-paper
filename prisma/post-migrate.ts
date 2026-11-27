/* eslint-disable no-console */
// Data steps that need application code or secrets and so cannot live in a SQL migration.
// Each step is idempotent: this runs after every deploy.
import type { PrismaClient } from "@prisma/client";
import { sealCnic } from "../src/server/infra/crypto";

async function columnExists(prisma: PrismaClient, table: string, column: string) {
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}`;
  return rows[0].n > 0;
}

// Migration 4: encrypt plaintext CNICs, then drop the plaintext column. One transaction per
// table, with the table locked, so a row written meanwhile cannot be left unencrypted.
async function encryptCnics(prisma: PrismaClient) {
  for (const table of ["SetterProfile", "SuperintendentProfile"] as const) {
    if (!(await columnExists(prisma, table, "cnic"))) continue;
    const count = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`LOCK TABLE "${table}" IN SHARE ROW EXCLUSIVE MODE`);
      const rows = await tx.$queryRawUnsafe<{ userId: string; cnic: string }[]>(
        `SELECT "userId", cnic FROM "${table}" WHERE cnic IS NOT NULL AND "cnicEncrypted" IS NULL`,
      );
      for (const r of rows) {
        const sealed = sealCnic(r.cnic);
        await tx.$executeRawUnsafe(
          `UPDATE "${table}" SET "cnicEncrypted" = $1, "cnicHash" = $2 WHERE "userId" = $3`,
          sealed.cnicEncrypted, sealed.cnicHash, r.userId,
        );
      }
      // Every row must now be encrypted; if not, this throws and nothing is dropped.
      await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ALTER COLUMN "cnicEncrypted" SET NOT NULL, ALTER COLUMN "cnicHash" SET NOT NULL`);
      await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DROP COLUMN cnic`);
      return rows.length;
    }, { timeout: 120_000 });
    console.log(`${table}: encrypted ${count} CNIC(s) and removed the plaintext column.`);
  }
}

export async function runPostMigrations(prisma: PrismaClient) {
  await encryptCnics(prisma);
}
