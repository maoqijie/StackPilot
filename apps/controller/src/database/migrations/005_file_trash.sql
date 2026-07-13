CREATE TABLE IF NOT EXISTS file_uploads (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  owner_display_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  target_directory TEXT NOT NULL,
  target_path TEXT NOT NULL,
  temporary_path TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
  received_bytes INTEGER NOT NULL DEFAULT 0 CHECK(received_bytes >= 0 AND received_bytes <= size_bytes),
  status TEXT NOT NULL CHECK(status IN ('waiting','uploading','completed','failed','cancelled')),
  sha256 TEXT,
  error_message TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE(owner_user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS file_uploads_created_at_idx ON file_uploads(created_at DESC);

CREATE TABLE IF NOT EXISTS terminal_snippet_preferences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snippet_id TEXT NOT NULL,
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0,1)),
  last_used_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, snippet_id)
);
CREATE INDEX IF NOT EXISTS terminal_snippet_preferences_user_updated_idx
  ON terminal_snippet_preferences(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS file_trash_entries (
  entry_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('file','directory')),
  original_path TEXT NOT NULL,
  size_bytes INTEGER CHECK(size_bytes IS NULL OR size_bytes >= 0),
  deleted_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  owner TEXT NOT NULL,
  reason TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'trashed' CHECK(state IN ('trashed','restored','purged')),
  restored_at TEXT,
  restored_by TEXT,
  purged_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0)
);
CREATE INDEX IF NOT EXISTS file_trash_state_time_idx ON file_trash_entries(state, deleted_at DESC);
ALTER TABLE file_trash_entries ADD COLUMN trash_path TEXT;

UPDATE release_metadata SET schema_version = 5, upgraded_at = CURRENT_TIMESTAMP WHERE singleton = 1;
