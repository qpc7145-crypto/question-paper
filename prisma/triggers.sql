-- FR-26: audit log is append-only at the database level.
CREATE TRIGGER IF NOT EXISTS audit_log_no_update
BEFORE UPDATE ON AuditLog
BEGIN
  SELECT RAISE(ABORT, 'AuditLog is append-only');
END;
--split
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
BEFORE DELETE ON AuditLog
BEGIN
  SELECT RAISE(ABORT, 'AuditLog is append-only');
END;
--split
-- FR-21: archived papers are locked at the database level as well.
CREATE TRIGGER IF NOT EXISTS paper_archived_locked
BEFORE UPDATE ON Paper
WHEN OLD.status = 'ARCHIVED'
BEGIN
  SELECT RAISE(ABORT, 'Archived papers are locked');
END;
