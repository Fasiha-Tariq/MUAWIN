BEGIN;
CREATE TABLE IF NOT EXISTS cloud_state (
    kind TEXT NOT NULL, key_hash TEXT NOT NULL, encrypted_value TEXT NOT NULL,
    expires_at DOUBLE PRECISION,
    PRIMARY KEY(kind, key_hash)
);
CREATE TABLE IF NOT EXISTS cloud_leases (
    key_hash TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS cloud_files (
    teacher TEXT NOT NULL, relative_path TEXT NOT NULL, object_key TEXT NOT NULL,
    checksum TEXT NOT NULL, PRIMARY KEY(teacher, relative_path)
);
CREATE TABLE IF NOT EXISTS cloud_course_folders (
    teacher TEXT NOT NULL, course_key TEXT NOT NULL, folder_path TEXT NOT NULL,
    PRIMARY KEY(teacher, course_key)
);
ALTER TABLE cloud_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_course_folders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cloud_state, cloud_leases, cloud_files FROM anon, authenticated;
REVOKE ALL ON cloud_course_folders FROM anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON cloud_state, cloud_leases, cloud_files TO muawin_backend;
GRANT SELECT,INSERT,UPDATE,DELETE ON cloud_course_folders TO muawin_backend;
ALTER TABLE class_suggestions ADD COLUMN IF NOT EXISTS preparing_until DOUBLE PRECISION DEFAULT 0;
COMMIT;
