-- Applied (idempotently) by prisma/seed.ts after every schema push.
-- Statements are separated by split-marker comment lines.

-- Supabase exposes the public schema through its Data API. Enable RLS with no
-- policies and revoke API roles, so the tables are reachable only through this app.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t.tablename);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t.tablename);
    END IF;
  END LOOP;
END $$;
--split
-- FR-26: audit log is append-only at the database level.
CREATE OR REPLACE FUNCTION qpb_audit_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$ LANGUAGE plpgsql;
--split
DROP TRIGGER IF EXISTS audit_log_no_update_delete ON "AuditLog";
--split
CREATE TRIGGER audit_log_no_update_delete BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION qpb_audit_append_only();
--split
DROP TRIGGER IF EXISTS audit_log_no_truncate ON "AuditLog";
--split
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION qpb_audit_append_only();
--split
-- FR-21: archived papers are locked at the database level as well.
CREATE OR REPLACE FUNCTION qpb_paper_archived_locked() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Archived papers are locked';
END;
$$ LANGUAGE plpgsql;
--split
DROP TRIGGER IF EXISTS paper_archived_locked ON "Paper";
--split
CREATE TRIGGER paper_archived_locked BEFORE UPDATE OR DELETE ON "Paper"
  FOR EACH ROW WHEN (OLD.status = 'ARCHIVED') EXECUTE FUNCTION qpb_paper_archived_locked();
--split
-- Step 4: paper versions are immutable once frozen (a setter's working draft is not frozen).
CREATE OR REPLACE FUNCTION qpb_paper_version_frozen() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Paper versions are immutable once frozen';
END;
$$ LANGUAGE plpgsql;
--split
DROP TRIGGER IF EXISTS paper_version_frozen ON "PaperVersion";
--split
CREATE TRIGGER paper_version_frozen BEFORE UPDATE OR DELETE ON "PaperVersion"
  FOR EACH ROW WHEN (OLD."frozenAt" IS NOT NULL) EXECUTE FUNCTION qpb_paper_version_frozen();
