# Question Paper Bank & Examination Paper Management System

Full-stack implementation of **SRS v1.0**, built with Next.js 14 (App Router), TypeScript, Tailwind CSS, Prisma (PostgreSQL) and TipTap.

## Quick start

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL, DIRECT_URL, AUTH_SECRET, DATA_ENCRYPTION_KEY
npm run setup:demo          # applies migrations, triggers/RLS, seeds demo data
npm run dev                 # http://localhost:3000
```

Use a **separate** database for demo data. Production is seeded with a single Controller only (see `CONTROLLER_EMAIL` / `INITIAL_CONTROLLER_PASSWORD`). In demo data, the ENG-101 paper unlocks for centres **3 minutes after seeding**, so you can watch the live countdown.

### Deployment (Vercel + Supabase)
`vercel.json` runs `npm run vercel-build`, which:
1. `prisma/deploy.ts` applies pending migrations from `prisma/migrations` (`prisma migrate deploy`), then runs `prisma/post-migrate.ts` (data steps that need app secrets, such as encrypting CNICs).
2. `prisma/seed.ts` re-applies the DB triggers and RLS lockdown, creates the private storage bucket and the first Controller if needed.
3. Builds Next.js.

Set every variable from `.env.example` in the Vercel project. `DATA_ENCRYPTION_KEY` is required.

**Upgrading a database created before migrations existed** (the old `prisma db push` flow): `deploy.ts` marks it as being at `0_init`, then refuses to apply later migrations to a database that holds data unless `MIGRATE_EXISTING_DB=true`. Take a backup, set the variable for one deploy, then remove it. During that deploy the previous app version is still serving and will error against the new schema until the build finishes, so deploy at a quiet time.

**Changing the schema:** edit `prisma/schema.prisma`, then generate the SQL with `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <empty db> --script` (or `prisma migrate dev` against a dev database). Review it: Prisma drops and re-creates columns whose type changes, so data moves must be written by hand (see migrations 1–4). Save it as `prisma/migrations/<n>_<name>/migration.sql`. Some objects are created in SQL only, because Prisma cannot express them: `Term_isCurrent_key` and `PaperAssignment_active_key` (partial unique indexes) and `Exam_deadline_before_exam_check`.

### Seed accounts (password for all: `Password@2026`)

| Role | Email | Notes |
|---|---|---|
| Controller | controller@qpbank.edu | Full authority |
| Paper Setter | setter1@qpbank.edu | Bio-data complete, has drafts / submitted / used papers |
| Paper Setter | setter2@qpbank.edu | Bio-data **pending** — shows the FR-4 gate |
| Paper Typist | typist@qpbank.edu | Assigned MATH-201 (with send delegation) and ENG-101 |
| Centre Superintendent | centre.a@qpbank.edu | Centre LHR-01 |
| Centre Superintendent | centre.b@qpbank.edu | Centre LHR-02 |

Password-reset OTPs are printed to the server console when SMTP is not configured.

## Architecture

```
src/
  middleware.ts                page-level RBAC + setter bio-data gate (FR-2, FR-4)
  app/api/**/route.ts          thin: parse input -> guard role -> call a service -> serialize.
                               ESLint forbids importing Prisma or the db client here.
  server/
    core/db.ts                 Prisma client, withTx() (one command = one transaction), row locks
    core/http.ts               route() wrapper, error mapping, body parsing
    auth/                      JWT session (jose, httpOnly cookie), DB-revalidated on every call; guards
    policy/index.ts            THE access policy: which papers/resources each role can see (scopes)
    infra/                     storage (private bucket, magic-byte checks), mailer, field encryption
    modules/
      papers/                  lifecycle state machine, versions, edits, submit, send, archive;
                               serializers = the ONLY shapes routes return (FR-14)
      distribution/            centre assignment, unlock rules, time-gated download (FR-17..20)
      academics/               terms, courses, exams ("subjects" in the API)
      users/ auth/ centres/ resources/ settings/ reports/
      audit/                   append-only, hash-chained audit log (FR-26)
      integrations/            FR-27/FR-28 API layer, API clients (per-system keys)
      notifications/           email outbox, deadline reminders, cron auth
  lib/                         code shared with the browser: constants, client fetch, renderer, demo mode
prisma/
  schema.prisma  migrations/  triggers.sql  deploy.ts  post-migrate.ts  seed.ts
```

**Rules**
- Every read of a paper goes through `policy.paperScope(actor)` combined with the id, so anything outside a user's scope is "not found". There are no per-route ownership checks to forget.
- Every command runs in one transaction that ends with `writeAudit(tx, …)`, so an action and its audit entry commit or fail together. Paper commands lock the paper row first (`SELECT … FOR UPDATE`).
- Inside `withTx`, use only the `tx` client (the app runs with `connection_limit=1`).

## Data model

| Area | Tables |
|---|---|
| People | `User` (role enum), `SetterProfile`, `SuperintendentProfile` (CNIC encrypted), `PasswordReset` |
| Academic | `Term` (season, year, `isCurrent`), `Course` (code, latest title), `Exam` (course × term × exam type; keeps its printed title) |
| Papers | `Paper` (workflow state, `currentVersionId`, `sentVersionId`), `PaperVersion` (immutable content history), `PaperAssignment` (setter/typist, with `canSend` delegation and revocation history) |
| Distribution | `Centre`, `PaperCentre` (unlock time, first access/download), `AccessLog` (records the version served) |
| Files | `StoredFile`, `Resource` (syllabus / model paper) |
| Platform | `AuditLog`, `Setting`, `ApiClient`, `OutboxMessage` |

### Confidentiality (FR-14) enforced at the API
- **Typist** payloads contain no setter id, name, email or bio-data. Uploaded file names are replaced with `<code>-paper.<ext>`, because original names can identify the author.
- **Setter** payloads contain no centres, typist, delegation or usage data. Setters only ever see their own papers, plus model papers that are `USED` **and** from a past semester **and** released.
- **Centre** payloads contain schedule metadata only. Paper content is served only by the time-gated download, watermarked with the centre code and the time.
- **Archived** papers are excluded from every non-Controller query.
- **CNICs** are stored AES-256-GCM encrypted with `DATA_ENCRYPTION_KEY`, plus a keyed hash for lookups. If that key is lost, stored CNICs cannot be read.

### Lifecycle and versions
`DRAFT → SUBMITTED → UNDER_MODIFICATION → SENT_TO_CENTRE → USED → ARCHIVED`
- A setter's draft is one working version, edited in place. Submitting freezes it.
- Each edit by the Controller or Typist after submission adds a new frozen version (a revision) and moves the paper to `UNDER_MODIFICATION`. Frozen versions cannot be changed (DB trigger).
- Sending records `sentVersionId`: centres always receive exactly that version, and each `AccessLog` row records it.
- Re-assigning a draft's setter revokes the old assignment, freezes their draft (kept in history) and starts a blank draft for the new setter. A paper with no active setter is hidden everywhere but kept.
- A centre's first access or download, at or after its unlock time (checked against the server clock), logs the access (FR-19) and auto-marks the paper `USED` (FR-20). Other assigned centres can still download it.
- `USED` papers are content-locked. The Controller archives them, which locks them permanently. A DB trigger also rejects updates to archived rows.
- The Controller can recall a sent paper only if no centre has accessed it yet.

### Audit log (FR-26)
- No UPDATE/DELETE endpoint exists, and database triggers abort any UPDATE/DELETE/TRUNCATE on `AuditLog`.
- Each row stores `sha256(prevHash + fields)`. **Audit Log → Verify integrity** recomputes the chain and reports the first broken entry. Writers take a `pg_advisory_xact_lock`, so concurrent serverless instances keep a single chain.

### Integration API (FR-27, FR-28)
Create one key per external system in **Controller → Settings → Integration API keys**, limited to the modules it uses (`result-system`, `erp`). The key is shown once; only its SHA-256 is stored. Revoked keys stop working immediately, and every call is audited with the client's name. Requests send `x-api-key: <key>`. The old shared `INTEGRATION_API_KEY` is still accepted for all modules until you remove it.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/integration/health` | Health check |
| GET | `/api/v1/integration/result-system/semesters` | Semester mapping |
| GET | `/api/v1/integration/result-system/subjects?semester=` | Subject mapping |
| POST | `/api/v1/integration/result-system/link` | `{ mappings: [{ code, semester, examType, externalRef }] }` |
| POST | `/api/v1/integration/erp/faculty` | `{ faculty: [{ email, name }] }`, created as inactive setters |
| POST | `/api/v1/integration/erp/centres` | `{ centres: [...] }`, upserts by code |
| POST | `/api/v1/integration/erp/calendar` | `{ events: [{ code, semester, examType, examDate }] }` |

New systems plug in by adding a handler module to `src/server/modules/integrations/index.ts` and its name to `INTEGRATION_MODULES`.

### Scheduled jobs and email
- `GET /api/cron/deadlines` (daily at 03:00 UTC via `vercel.json`) queues a reminder for each setter whose draft is due within 48 hours, then delivers the outbox. `GET /api/cron/outbox` only delivers, and can be scheduled more often on plans that allow it. Both require `Authorization: Bearer $CRON_SECRET`; Vercel sends it automatically when `CRON_SECRET` is set.
- Emails go through `OutboxMessage`: written in the triggering transaction, claimed with `FOR UPDATE SKIP LOCKED`, retried with backoff. Password-reset OTPs are the exception: they are secrets that are only useful for minutes, so they are sent directly.

## Production notes
- **Database:** PostgreSQL. `prisma/triggers.sql` enables RLS with no policies on every table, so Supabase's public Data API cannot read them. It also adds the append-only, archive-lock and frozen-version triggers.
- **Storage:** a private Supabase Storage bucket, accessed only server-side with the service-role key.
- **Email:** set `SMTP_*` so OTPs and reminders are emailed instead of logged.
- Word documents can carry author metadata. Setters are told to strip it, but consider server-side metadata scrubbing.
