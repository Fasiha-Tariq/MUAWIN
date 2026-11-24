BEGIN;

ALTER TABLE class_chunks ADD COLUMN IF NOT EXISTS created_order BIGINT GENERATED ALWAYS AS IDENTITY;
ALTER TABLE class_suggestions ADD COLUMN IF NOT EXISTS created_order BIGINT GENERATED ALWAYS AS IDENTITY;
ALTER TABLE class_workflows ADD COLUMN IF NOT EXISTS created_order BIGINT GENERATED ALWAYS AS IDENTITY;
CREATE INDEX IF NOT EXISTS class_chunks_pending ON class_chunks(status, retry_at, created_order);
CREATE INDEX IF NOT EXISTS idx_audit_teacher_time ON audit_events(teacher_username, created_at DESC);
ALTER TABLE class_chunks ALTER COLUMN retry_at TYPE DOUBLE PRECISION;

COMMIT;
