-- Step 3: split Subject into Term (Fall 2026), Course (CS-301) and Exam (CS-301's FINAL in
-- Fall 2026), and move the "current semester" setting onto Term.isCurrent.
-- Hand-written: Prisma's generated SQL drops "Subject" and the papers' links to it.
--  * Exam rows keep the old Subject ids, so URLs, resource links and audit-log entity ids
--    that point at a subject still resolve.
--  * Each exam keeps the title printed on its paper; Course.title is the most recent one.

CREATE TYPE "Season" AS ENUM ('SPRING', 'SUMMER', 'FALL', 'WINTER');

-- Refuse to guess: every semester label must already be "Season YYYY" (the app has always
-- validated this on input). A bad label aborts the migration with the offending values.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(DISTINCT semester, ', ') INTO bad
    FROM "Subject" WHERE semester !~ '^(Spring|Summer|Fall|Winter) [0-9]{4}$';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot migrate subjects: semester labels must look like "Fall 2026"; found: %', bad;
  END IF;
END $$;

CREATE TABLE "Term" (
    "id" TEXT NOT NULL,
    "season" "Season" NOT NULL,
    "year" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Term_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Term_season_year_key" ON "Term"("season", "year");
-- At most one current term (not expressible in schema.prisma).
CREATE UNIQUE INDEX "Term_isCurrent_key" ON "Term"("isCurrent") WHERE "isCurrent";

CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Course_code_key" ON "Course"("code");

CREATE TABLE "Exam" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "examType" "ExamType" NOT NULL,
    "title" TEXT NOT NULL,
    "examDate" TIMESTAMP(3) NOT NULL,
    "submissionDeadline" TIMESTAMP(3) NOT NULL,
    "setterId" TEXT,
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Exam_termId_examDate_idx" ON "Exam"("termId", "examDate");
CREATE INDEX "Exam_setterId_idx" ON "Exam"("setterId");
CREATE UNIQUE INDEX "Exam_courseId_termId_examType_key" ON "Exam"("courseId", "termId", "examType");

-- ---------- Data ----------

-- Terms: every semester used by a subject, plus the configured current semester.
INSERT INTO "Term" ("id", "season", "year")
SELECT 'term_' || lower(split_part(label, ' ', 1)) || '_' || split_part(label, ' ', 2),
       upper(split_part(label, ' ', 1))::"Season",
       split_part(label, ' ', 2)::int
FROM (
  SELECT DISTINCT semester AS label FROM "Subject"
  UNION
  SELECT trim(regexp_replace(value, '\s+', ' ', 'g')) FROM "Setting"
   WHERE key = 'currentSemester' AND trim(regexp_replace(value, '\s+', ' ', 'g')) ~ '^(Spring|Summer|Fall|Winter) [0-9]{4}$'
) labels;

-- The current-semester setting becomes Term.isCurrent. A label that is not "Season YYYY"
-- never matched any subject, so it already meant "no current term": that is preserved,
-- and the unused setting row is left in place.
UPDATE "Term" t SET "isCurrent" = true
FROM "Setting" s
WHERE s.key = 'currentSemester'
  AND t."season"::text = upper(split_part(trim(regexp_replace(s.value, '\s+', ' ', 'g')), ' ', 1))
  AND t."year"::text = split_part(trim(regexp_replace(s.value, '\s+', ' ', 'g')), ' ', 2);
DELETE FROM "Setting" WHERE key = 'currentSemester' AND EXISTS (SELECT 1 FROM "Term" WHERE "isCurrent");

-- Courses: one per code, titled after its most recent exam.
INSERT INTO "Course" ("id", "code", "title", "createdAt")
SELECT DISTINCT ON (code) 'crs_' || substr(md5(code), 1, 21), code, title, min("createdAt") OVER (PARTITION BY code)
FROM "Subject"
ORDER BY code, "examDate" DESC;

-- Exams keep the Subject ids.
INSERT INTO "Exam" ("id", "courseId", "termId", "examType", "title", "examDate", "submissionDeadline", "setterId", "externalRef", "createdAt")
SELECT s.id, c.id,
       'term_' || lower(split_part(s.semester, ' ', 1)) || '_' || split_part(s.semester, ' ', 2),
       s."examType", s.title, s."examDate", s."submissionDeadline", s."setterId", s."externalRef", s."createdAt"
FROM "Subject" s JOIN "Course" c ON c.code = s.code;

-- Enforced for every new or changed exam. NOT VALID: existing rows are not re-checked,
-- so one historical oddity cannot block the deploy (the app has always enforced it).
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_deadline_before_exam_check" CHECK ("submissionDeadline" < "examDate") NOT VALID;

-- ---------- Re-point papers and resources (same ids, new column names) ----------

-- The archive-lock trigger blocks UPDATEs of archived papers; a column rename is DDL and
-- does not fire it, so archived rows keep their link without being unlocked.
ALTER TABLE "Paper" DROP CONSTRAINT "Paper_subjectId_fkey";
ALTER TABLE "Paper" RENAME COLUMN "subjectId" TO "examId";
ALTER INDEX "Paper_subjectId_key" RENAME TO "Paper_examId_key";

ALTER TABLE "Resource" DROP CONSTRAINT "Resource_subjectId_fkey";
ALTER TABLE "Resource" RENAME COLUMN "subjectId" TO "examId";
ALTER INDEX "Resource_subjectId_idx" RENAME TO "Resource_examId_idx";

ALTER TABLE "Subject" DROP CONSTRAINT "Subject_setterId_fkey";
DROP TABLE "Subject";

ALTER TABLE "Exam" ADD CONSTRAINT "Exam_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_setterId_fkey" FOREIGN KEY ("setterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Paper" ADD CONSTRAINT "Paper_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
