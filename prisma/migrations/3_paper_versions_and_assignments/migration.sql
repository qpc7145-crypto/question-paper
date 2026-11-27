-- Step 4: paper content moves into immutable, numbered PaperVersion rows, and who works on
-- a paper moves into PaperAssignment rows with history. Hand-written: Prisma's generated
-- SQL drops every paper's content and its setter/typist links.
--
-- Backfill of each paper's history from PaperRevision (each revision row stored the
-- content as it was BEFORE that revision's edit):
--   version 1..k   = the k revision snapshots, oldest first
--   version k+1    = the paper's current content (becomes Paper.currentVersionId)
--   The author/note of version i+1 are those of revision i (the edit that produced it);
--   version 1 was written by the setter.
-- Every version is frozen except the working draft of a paper still in DRAFT.

CREATE TYPE "AssignmentRole" AS ENUM ('SETTER', 'TYPIST');

CREATE TABLE "PaperVersion" (
    "id" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "format" "PaperFormat" NOT NULL DEFAULT 'RICH_TEXT',
    "mode" "PaperMode" NOT NULL DEFAULT 'FREE',
    "content" JSONB NOT NULL DEFAULT '{}',
    "instructions" TEXT NOT NULL DEFAULT '',
    "totalMarks" INTEGER,
    "durationMinutes" INTEGER,
    "fileId" TEXT,
    "authorId" TEXT NOT NULL,
    "authorRole" "Role" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "frozenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaperVersion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PaperVersion_fileId_idx" ON "PaperVersion"("fileId");
CREATE UNIQUE INDEX "PaperVersion_paperId_number_key" ON "PaperVersion"("paperId", "number");

CREATE TABLE "PaperAssignment" (
    "id" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AssignmentRole" NOT NULL,
    "canSend" BOOLEAN NOT NULL DEFAULT false,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PaperAssignment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PaperAssignment_userId_role_revokedAt_idx" ON "PaperAssignment"("userId", "role", "revokedAt");
CREATE INDEX "PaperAssignment_paperId_revokedAt_idx" ON "PaperAssignment"("paperId", "revokedAt");
-- One active setter and one active typist per paper (not expressible in schema.prisma).
CREATE UNIQUE INDEX "PaperAssignment_active_key" ON "PaperAssignment"("paperId", "role") WHERE "revokedAt" IS NULL;

ALTER TABLE "Paper" ADD COLUMN "currentVersionId" TEXT, ADD COLUMN "sentVersionId" TEXT;
CREATE UNIQUE INDEX "Paper_currentVersionId_key" ON "Paper"("currentVersionId");

-- ---------- Versions from revision snapshots ----------

INSERT INTO "PaperVersion" ("id", "paperId", "number", "format", "mode", "content", "instructions", "totalMarks",
                            "durationMinutes", "fileId", "authorId", "authorRole", "note", "frozenAt", "createdAt", "updatedAt")
SELECT 'pv_' || p.id || '_' || r.n, p.id, r.n,
       COALESCE(NULLIF(s.j->>'format', ''), 'RICH_TEXT')::"PaperFormat",
       COALESCE(NULLIF(s.j->>'mode', ''), 'FREE')::"PaperMode",
       jsonb_build_object(
         'contentHtml', COALESCE(s.j->>'contentHtml', ''),
         'sections', jsonb_build_object('A', COALESCE(s.j->>'sectionAHtml', ''), 'B', COALESCE(s.j->>'sectionBHtml', ''), 'C', COALESCE(s.j->>'sectionCHtml', ''))),
       COALESCE(s.j->>'instructions', ''),
       (s.j->>'totalMarks')::int,
       (s.j->>'durationMinutes')::int,
       (SELECT f.id FROM "StoredFile" f WHERE f.id = s.j->>'fileId'),
       COALESCE(r.prev_editor, p."setterId"),
       COALESCE(r.prev_role, 'SETTER'),
       COALESCE(r.prev_note, ''),
       t.at, t.at, t.at
FROM (
  SELECT rv.*,
         row_number() OVER w AS n,
         lag(rv."editorId") OVER w AS prev_editor,
         lag(rv."editorRole") OVER w AS prev_role,
         lag(rv.note) OVER w AS prev_note,
         lag(rv."createdAt") OVER w AS prev_at
  FROM "PaperRevision" rv
  WINDOW w AS (PARTITION BY rv."paperId" ORDER BY rv."createdAt", rv.id)
) r
JOIN "Paper" p ON p.id = r."paperId"
CROSS JOIN LATERAL (SELECT r.snapshot::jsonb AS j) s
CROSS JOIN LATERAL (SELECT COALESCE(r.prev_at, p."submittedAt", p."createdAt") AS at) t;

-- ---------- The current content as the latest version ----------

INSERT INTO "PaperVersion" ("id", "paperId", "number", "format", "mode", "content", "instructions", "totalMarks",
                            "durationMinutes", "fileId", "authorId", "authorRole", "note", "frozenAt", "createdAt", "updatedAt")
SELECT 'pv_' || p.id || '_' || (h.k + 1), p.id, h.k + 1,
       p.format, p.mode,
       jsonb_build_object(
         'contentHtml', p."contentHtml",
         'sections', jsonb_build_object('A', p."sectionAHtml", 'B', p."sectionBHtml", 'C', p."sectionCHtml")),
       p.instructions, p."totalMarks", p."durationMinutes", p."fileId",
       COALESCE(last."editorId", p."setterId"),
       COALESCE(last."editorRole", 'SETTER'),
       COALESCE(last.note, ''),
       CASE WHEN p.status = 'DRAFT' THEN NULL ELSE COALESCE(last."createdAt", p."submittedAt", p."updatedAt") END,
       COALESCE(last."createdAt", p."submittedAt", p."createdAt"),
       p."updatedAt"
FROM "Paper" p
CROSS JOIN LATERAL (SELECT count(*)::int AS k FROM "PaperRevision" rv WHERE rv."paperId" = p.id) h
LEFT JOIN LATERAL (
  SELECT rv."editorId", rv."editorRole", rv.note, rv."createdAt" FROM "PaperRevision" rv
  WHERE rv."paperId" = p.id ORDER BY rv."createdAt" DESC, rv.id DESC LIMIT 1
) last ON true;

-- Point papers at their versions. Archived papers are locked by a trigger; this one-off
-- re-linking is allowed by disabling it for the statement, inside this transaction.
ALTER TABLE "Paper" DISABLE TRIGGER paper_archived_locked;
UPDATE "Paper" p SET
  "currentVersionId" = v.id,
  "sentVersionId" = CASE WHEN p.status IN ('SENT_TO_CENTRE', 'USED', 'ARCHIVED') THEN v.id END
FROM (SELECT DISTINCT ON ("paperId") id, "paperId" FROM "PaperVersion" ORDER BY "paperId", number DESC) v
WHERE v."paperId" = p.id;
ALTER TABLE "Paper" ENABLE TRIGGER paper_archived_locked;

-- Content is locked from a paper's first centre access onward, so every logged access
-- served the paper's current version: the backfill is exact, not a guess.
ALTER TABLE "AccessLog" ADD COLUMN "versionId" TEXT;
UPDATE "AccessLog" a SET "versionId" = p."currentVersionId" FROM "Paper" p WHERE p.id = a."paperId";
ALTER TABLE "AccessLog" ALTER COLUMN "versionId" SET NOT NULL;

-- ---------- Assignments ----------

INSERT INTO "PaperAssignment" ("id", "paperId", "userId", "role", "canSend", "assignedAt")
SELECT 'pa_' || id || '_setter', id, "setterId", 'SETTER', false, "createdAt" FROM "Paper";
INSERT INTO "PaperAssignment" ("id", "paperId", "userId", "role", "canSend", "assignedAt")
SELECT 'pa_' || id || '_typist', id, "typistId", 'TYPIST', "typistCanSend", "createdAt" FROM "Paper" WHERE "typistId" IS NOT NULL;

-- ---------- Drop the old columns ----------

ALTER TABLE "Exam" DROP CONSTRAINT "Exam_setterId_fkey";
DROP INDEX "Exam_setterId_idx";
ALTER TABLE "Exam" DROP COLUMN "setterId";

ALTER TABLE "Paper" DROP CONSTRAINT "Paper_setterId_fkey";
ALTER TABLE "Paper" DROP CONSTRAINT "Paper_typistId_fkey";
ALTER TABLE "Paper" DROP CONSTRAINT "Paper_fileId_fkey";
DROP INDEX "Paper_fileId_key";
DROP INDEX "Paper_setterId_idx";
DROP INDEX "Paper_typistId_idx";
ALTER TABLE "Paper" DROP COLUMN "contentHtml",
  DROP COLUMN "durationMinutes",
  DROP COLUMN "fileId",
  DROP COLUMN "format",
  DROP COLUMN "instructions",
  DROP COLUMN "mode",
  DROP COLUMN "sectionAHtml",
  DROP COLUMN "sectionBHtml",
  DROP COLUMN "sectionCHtml",
  DROP COLUMN "setterId",
  DROP COLUMN "totalMarks",
  DROP COLUMN "typistCanSend",
  DROP COLUMN "typistId";

DROP TABLE "PaperRevision";

ALTER TABLE "Paper" ADD CONSTRAINT "Paper_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "PaperVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Paper" ADD CONSTRAINT "Paper_sentVersionId_fkey" FOREIGN KEY ("sentVersionId") REFERENCES "PaperVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaperVersion" ADD CONSTRAINT "PaperVersion_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaperVersion" ADD CONSTRAINT "PaperVersion_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaperVersion" ADD CONSTRAINT "PaperVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaperAssignment" ADD CONSTRAINT "PaperAssignment_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaperAssignment" ADD CONSTRAINT "PaperAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PaperVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Frozen versions are immutable (same definition as prisma/triggers.sql).
CREATE OR REPLACE FUNCTION qpb_paper_version_frozen() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Paper versions are immutable once frozen';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER paper_version_frozen BEFORE UPDATE OR DELETE ON "PaperVersion"
  FOR EACH ROW WHEN (OLD."frozenAt" IS NOT NULL) EXECUTE FUNCTION qpb_paper_version_frozen();
