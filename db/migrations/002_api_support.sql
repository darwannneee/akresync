-- Dukungan backend API (migrasi tambahan; 001 tidak diubah).

-- 1) Teks asli (catatan, alasan) yang hanya hash-nya ada di chain. Tidak dikirim ke ledger.
ALTER TABLE formal_records ADD COLUMN IF NOT EXISTS off_chain jsonb;

-- 2) NOTIFY untuk SSE: perubahan audit_status dan commit formal_records.
CREATE OR REPLACE FUNCTION notify_audit_status() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sid uuid;
BEGIN
  SELECT submission_id INTO sid FROM outbox WHERE id = NEW.event_id;
  PERFORM pg_notify('audit_status', json_build_object(
    'eventId', NEW.event_id, 'submissionId', sid, 'status', NEW.status,
    'txId', NEW.tx_id, 'blockNumber', NEW.block_number, 'attempts', NEW.attempts)::text);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_status_notify ON audit_status;
CREATE TRIGGER audit_status_notify AFTER INSERT OR UPDATE ON audit_status
  FOR EACH ROW EXECUTE FUNCTION notify_audit_status();

CREATE OR REPLACE FUNCTION notify_record_committed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'committed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'committed') THEN
    PERFORM pg_notify('record_committed', json_build_object(
      'id', NEW.id, 'submissionId', NEW.submission_id, 'recordType', NEW.record_type,
      'version', NEW.version, 'txId', NEW.tx_id, 'blockNumber', NEW.block_number)::text);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS formal_records_notify ON formal_records;
CREATE TRIGGER formal_records_notify AFTER INSERT OR UPDATE ON formal_records
  FOR EACH ROW EXECUTE FUNCTION notify_record_committed();
