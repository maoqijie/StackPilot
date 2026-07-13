CREATE TABLE terminal_snippet_preferences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snippet_id TEXT NOT NULL,
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0,1)),
  last_used_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, snippet_id)
);

CREATE INDEX terminal_snippet_preferences_user_updated_idx
  ON terminal_snippet_preferences(user_id, updated_at DESC);
