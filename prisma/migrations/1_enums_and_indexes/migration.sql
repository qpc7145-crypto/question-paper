-- Step 1: replace free-form status/role strings with Postgres enums, and add the
-- indexes the app's queries need. Hand-written: Prisma's generated SQL drops and
-- re-creates each column, which would erase every status and role. Here every column
-- is converted in place with a USING cast. A row holding a value outside the enum
-- makes the cast fail and the whole migration roll back, so nothing is lost silently.

CREATE TYPE "Role" AS ENUM ('CONTROLLER', 'SETTER', 'TYPIST', 'SUPERINTENDENT');
CREATE TYPE "PaperStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_MODIFICATION', 'SENT_TO_CENTRE', 'USED', 'ARCHIVED');
CREATE TYPE "PaperFormat" AS ENUM ('RICH_TEXT', 'FILE');
CREATE TYPE "PaperMode" AS ENUM ('FREE', 'STRUCTURED');
CREATE TYPE "ExamType" AS ENUM ('MIDTERM', 'FINAL', 'SUPPLEMENTARY', 'SPECIAL');
CREATE TYPE "AccessKind" AS ENUM ('ACCESS', 'DOWNLOAD');
CREATE TYPE "ResourceKind" AS ENUM ('SYLLABUS', 'MODEL_PAPER');

-- The archive-lock trigger's WHEN clause reads "Paper"."status", and Postgres refuses to
-- change the type of a column a trigger depends on. Drop it here and re-create it below,
-- inside this same transaction, so archived papers are never left unprotected.
DROP TRIGGER IF EXISTS paper_archived_locked ON "Paper";

ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING "role"::"Role";
ALTER TABLE "Subject" ALTER COLUMN "examType" TYPE "ExamType" USING "examType"::"ExamType";

ALTER TABLE "Paper" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Paper" ALTER COLUMN "status" TYPE "PaperStatus" USING "status"::"PaperStatus";
ALTER TABLE "Paper" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
ALTER TABLE "Paper" ALTER COLUMN "format" DROP DEFAULT;
ALTER TABLE "Paper" ALTER COLUMN "format" TYPE "PaperFormat" USING "format"::"PaperFormat";
ALTER TABLE "Paper" ALTER COLUMN "format" SET DEFAULT 'RICH_TEXT';
ALTER TABLE "Paper" ALTER COLUMN "mode" DROP DEFAULT;
ALTER TABLE "Paper" ALTER COLUMN "mode" TYPE "PaperMode" USING "mode"::"PaperMode";
ALTER TABLE "Paper" ALTER COLUMN "mode" SET DEFAULT 'FREE';

ALTER TABLE "PaperRevision" ALTER COLUMN "editorRole" TYPE "Role" USING "editorRole"::"Role";
ALTER TABLE "AccessLog" ALTER COLUMN "kind" TYPE "AccessKind" USING "kind"::"AccessKind";
ALTER TABLE "Resource" ALTER COLUMN "kind" TYPE "ResourceKind" USING "kind"::"ResourceKind";
-- ALTER TABLE does not fire row triggers, so the append-only guard on AuditLog is not
-- tripped. The enum's text form equals the old string, so every row's hash still verifies.
ALTER TABLE "AuditLog" ALTER COLUMN "role" TYPE "Role" USING "role"::"Role";

-- Same definition as prisma/triggers.sql (the seed re-applies that file idempotently).
CREATE OR REPLACE FUNCTION qpb_paper_archived_locked() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Archived papers are locked';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER paper_archived_locked BEFORE UPDATE OR DELETE ON "Paper"
  FOR EACH ROW WHEN (OLD.status = 'ARCHIVED') EXECUTE FUNCTION qpb_paper_archived_locked();

-- Indexes
DROP INDEX "AuditLog_action_idx";
DROP INDEX "AuditLog_userId_idx";
CREATE INDEX "AuditLog_action_at_idx" ON "AuditLog"("action", "at");
CREATE INDEX "AuditLog_userId_at_idx" ON "AuditLog"("userId", "at");
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");
CREATE INDEX "Subject_semester_examDate_idx" ON "Subject"("semester", "examDate");
CREATE INDEX "Subject_setterId_idx" ON "Subject"("setterId");
CREATE INDEX "Paper_status_idx" ON "Paper"("status");
CREATE INDEX "Paper_setterId_idx" ON "Paper"("setterId");
CREATE INDEX "Paper_typistId_idx" ON "Paper"("typistId");
CREATE INDEX "PaperRevision_paperId_createdAt_idx" ON "PaperRevision"("paperId", "createdAt");
CREATE INDEX "PaperCentre_centreId_availableFrom_idx" ON "PaperCentre"("centreId", "availableFrom");
CREATE INDEX "AccessLog_paperId_at_idx" ON "AccessLog"("paperId", "at");
CREATE INDEX "AccessLog_centreId_at_idx" ON "AccessLog"("centreId", "at");
CREATE INDEX "StoredFile_uploadedById_idx" ON "StoredFile"("uploadedById");
CREATE INDEX "Resource_kind_idx" ON "Resource"("kind");
CREATE INDEX "Resource_subjectId_idx" ON "Resource"("subjectId");
CREATE INDEX "PasswordReset_userId_createdAt_idx" ON "PasswordReset"("userId", "createdAt");
