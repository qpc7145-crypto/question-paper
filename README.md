# Question Paper Bank & Examination Paper Management System

Full-stack implementation of **SRS v1.0**, built with Next.js 14 (App Router), TypeScript, Tailwind CSS, Prisma and TipTap.

## Quick start

```bash
npm install
cp .env.example .env        # then set AUTH_SECRET (≥32 chars)
npm run setup               # creates SQLite DB, DB triggers and seed data
npm run dev                 # http://localhost:3000
```

`npm run db:reset` wipes the database and reseeds it. The seeded ENG-101 paper unlocks for centres **3 minutes after seeding**, so you can watch the live countdown.

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
  middleware.ts              page-level RBAC + setter bio-data gate (FR-2, FR-4)
  lib/
    auth/                    JWT session (jose, httpOnly cookie), DB-revalidated on every API call
    serializers.ts           role-specific views — the ONLY shapes API routes return (FR-14)
    lifecycle.ts             paper state machine (SRS 3.8)
    papers.ts                content edits, revisions, submit, send-to-centre
    audit.ts                 append-only SHA-256 hash-chained audit log (FR-26)
    storage.ts               private file repository, magic-byte validation, streamed downloads
    reports.ts / exporters   FR-23/24/25 reports, PDF (pdf-lib) + Excel (exceljs) export
    integration/             modular FR-27/FR-28 API layer (result-system, erp)
  app/api/
    auth/*                   login, logout, OTP forgot/reset (FR-3), change password
    controller/*             accounts, subjects, papers, centres, resources, reports, audit, export
    setter/* typist/* centre/*   role-scoped endpoints
    v1/integration/[...path] x-api-key protected integration endpoints
```

### Confidentiality (FR-14) enforced at the API
- **Typist** payloads contain no setter id, name, email or bio-data. Uploaded file names are replaced with `<code>-paper.<ext>`, because original names can identify the author.
- **Setter** payloads contain no centres, typist, delegation or usage data. Setters only ever see their own papers, plus model papers that are `USED` **and** from a past semester **and** released.
- **Centre** payloads contain schedule metadata only. Paper content is served only by the time-gated download, watermarked with the centre code and the time.
- **Archived** papers are excluded from every non-Controller query.

### Lifecycle
`DRAFT → SUBMITTED → UNDER_MODIFICATION → SENT_TO_CENTRE → USED → ARCHIVED`
- An edit by the Controller or Typist after submission records a revision and moves the paper to `UNDER_MODIFICATION`.
- A centre's first access or download, at or after its unlock time (checked against the server clock), logs the access (FR-19) and auto-marks the paper `USED` (FR-20). Other assigned centres can still download it.
- `USED` papers are content-locked. The Controller archives them, which locks them permanently. A DB trigger also rejects updates to archived rows.
- The Controller can recall a sent paper only if no centre has accessed it yet.

### Audit log (FR-26)
- No UPDATE/DELETE endpoint exists, and SQLite triggers abort any UPDATE/DELETE on `AuditLog`.
- Each row stores `sha256(prevHash + fields)`. **Audit Log → Verify integrity** recomputes the chain and reports the first broken entry.

### Integration API (FR-27, FR-28)
Every request sends the `x-api-key: $INTEGRATION_API_KEY` header.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/integration/health` | Health check |
| GET | `/api/v1/integration/result-system/semesters` | Semester mapping |
| GET | `/api/v1/integration/result-system/subjects?semester=` | Subject mapping |
| POST | `/api/v1/integration/result-system/link` | `{ mappings: [{ code, semester, examType, externalRef }] }` |
| POST | `/api/v1/integration/erp/faculty` | `{ faculty: [{ email, name }] }`, created as inactive setters |
| POST | `/api/v1/integration/erp/centres` | `{ centres: [...] }`, upserts by code |
| POST | `/api/v1/integration/erp/calendar` | `{ events: [{ code, semester, examType, examDate }] }` |

New systems plug in by adding a handler module to `src/lib/integration/index.ts`.

## Production notes
- **PostgreSQL:** change `provider` in `prisma/schema.prisma` to `postgresql` and set `DATABASE_URL`. The schema uses no SQLite-specific types. Port `prisma/triggers.sql` to PL/pgSQL triggers. Wrap `audit()` in `pg_advisory_xact_lock` when running more than one instance.
- **Storage:** `STORAGE_DIR` must be persistent and private. For S3-compatible storage, swap the implementation of `saveUpload` / `readStored` in `src/lib/storage.ts`.
- **Email:** set `SMTP_*` so OTPs are emailed instead of logged.
- Word documents can carry author metadata. Setters are told to strip it, but consider server-side metadata scrubbing.
