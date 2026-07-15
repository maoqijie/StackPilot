CREATE TABLE audit_exports (
  export_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  format TEXT NOT NULL CHECK(format IN ('csv','json')),
  status TEXT NOT NULL CHECK(status IN ('ready','failed')),
  row_count INTEGER NOT NULL CHECK(row_count >= 0),
  size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
  storage_name TEXT UNIQUE,
  sha256 TEXT,
  creator_user_id TEXT NOT NULL,
  creator_display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  expires_at TEXT NOT NULL,
  trace_id TEXT NOT NULL UNIQUE,
  error_code TEXT,
  source_max_sequence INTEGER NOT NULL CHECK(source_max_sequence >= 0)
);
CREATE INDEX audit_exports_created_idx ON audit_exports(created_at DESC);
CREATE INDEX audit_exports_expires_idx ON audit_exports(expires_at);
UPDATE release_metadata SET schema_version = 9, upgraded_at = CURRENT_TIMESTAMP WHERE singleton = 1;
