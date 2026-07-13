CREATE TABLE file_uploads (
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

CREATE INDEX file_uploads_created_at_idx ON file_uploads(created_at DESC);
