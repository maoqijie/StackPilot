CREATE TABLE release_metadata (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  application_version TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  upgraded_at TEXT NOT NULL
);
INSERT INTO release_metadata(singleton, application_version, schema_version, upgraded_at)
VALUES(1, '0.2.0-preview.1', 2, CURRENT_TIMESTAMP);
CREATE INDEX audit_events_action_time_idx ON audit_events(action, occurred_at);
