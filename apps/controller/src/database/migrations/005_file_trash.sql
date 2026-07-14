CREATE TABLE file_trash_entries (
  entry_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('file','directory')),
  root_path TEXT NOT NULL,
  original_path TEXT NOT NULL,
  quarantine_path TEXT NOT NULL UNIQUE,
  size_bytes INTEGER CHECK(size_bytes IS NULL OR size_bytes >= 0),
  deleted_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  owner TEXT NOT NULL,
  reason TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('moving','trashed','restoring','restored','purging','purged')),
  restored_at TEXT,
  restored_by TEXT,
  purged_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0)
);

CREATE INDEX file_trash_state_time_idx ON file_trash_entries(state, deleted_at DESC);

UPDATE release_metadata
SET schema_version = 5,
    upgraded_at = CURRENT_TIMESTAMP
WHERE singleton = 1;
