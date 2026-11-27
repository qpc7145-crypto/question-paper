/* eslint-disable no-console */
// Applies database migrations (replaces `prisma db push`, which drops and re-creates
// columns it cannot alter in place, losing data). Run before prisma/seed.ts.
//
//  - Empty database:            every migration is applied.
//  - Existing database created by the old `db push` flow (no _prisma_migrations table):
//                               it is marked as being at 0_init (the schema db push produced),
//                               then later migrations apply as below.
//  - Existing database with pending migrations: refuses to run unless
//                               MIGRATE_EXISTING_DB=true, so a deploy never reshapes
//                               production data without someone having taken a backup first.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { runPostMigrations } from "./post-migrate";
import { encryptField } from "../src/server/infra/crypto";

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL });
// Release our connection first: the CLI opens its own and takes the migration lock.
async function prismaCli(args: string) {
  await prisma.$disconnect();
  execSync(`npx prisma ${args}`, { stdio: "inherit" });
}

async function tableExists(name: string) {
  const rows = await prisma.$queryRaw<{ r: string | null }[]>`SELECT to_regclass(${`public."${name}"`})::text AS r`;
  return rows[0]?.r != null;
}

async function main() {
  // Fail before touching the schema if the CNIC encryption key is missing or malformed.
  encryptField("key check");

  const migrationsDir = path.join(__dirname, "migrations");
  const all = fs.readdirSync(migrationsDir)
    .filter((d) => fs.statSync(path.join(migrationsDir, d)).isDirectory())
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  const hasData = await tableExists("User");
  if (hasData && !(await tableExists("_prisma_migrations"))) {
    console.log("Existing database without migration history: baselining at 0_init.");
    await prismaCli("migrate resolve --applied 0_init");
  }

  const applied = hasData
    ? new Set((await prisma.$queryRaw<{ migration_name: string }[]>`
        SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`).map((r) => r.migration_name))
    : new Set<string>();
  const pending = all.filter((m) => !applied.has(m));

  if (pending.length === 0) {
    console.log("Database schema is up to date.");
  } else if (hasData && process.env.MIGRATE_EXISTING_DB !== "true") {
    console.error(
      `\nThis database holds data and has ${pending.length} pending migration(s):\n  ${pending.join("\n  ")}\n\n` +
      "They reshape existing tables. Take a backup (Supabase: Database -> Backups), then re-run with\n" +
      "MIGRATE_EXISTING_DB=true (in Vercel: add it as an environment variable and redeploy).\n",
    );
    process.exit(1);
  } else {
    console.log(`Applying ${pending.length} migration(s): ${pending.join(", ")}`);
    await prismaCli("migrate deploy");
  }

  await runPostMigrations(prisma);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
