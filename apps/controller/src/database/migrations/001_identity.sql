CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  disabled_at TEXT,
  password_changed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE roles (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL, builtin INTEGER NOT NULL DEFAULT 0 CHECK (builtin IN (0,1)), created_at TEXT NOT NULL);
CREATE TABLE permissions (key TEXT PRIMARY KEY, risk TEXT NOT NULL CHECK (risk IN ('low','medium','high')), description TEXT NOT NULL);
CREATE TABLE role_permissions (role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE, permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE, PRIMARY KEY(role_id, permission_key));
CREATE TABLE user_roles (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE, PRIMARY KEY(user_id, role_id));
CREATE TABLE user_node_scopes (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, node_id TEXT NOT NULL, PRIMARY KEY(user_id, node_id));
CREATE TABLE sessions (id_digest TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf_digest TEXT NOT NULL, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, source TEXT NOT NULL, user_agent_hash TEXT NOT NULL);
CREATE INDEX sessions_user_idx ON sessions(user_id, revoked_at, expires_at);
CREATE TABLE reauth_challenges (digest TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, session_digest TEXT NOT NULL REFERENCES sessions(id_digest) ON DELETE CASCADE, expires_at TEXT NOT NULL, used_at TEXT);
CREATE TABLE api_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, token_digest TEXT NOT NULL UNIQUE, all_nodes INTEGER NOT NULL DEFAULT 0 CHECK(all_nodes IN (0,1)), created_at TEXT NOT NULL, expires_at TEXT, last_used_at TEXT, revoked_at TEXT);
CREATE TABLE api_token_permissions (token_id TEXT NOT NULL REFERENCES api_tokens(id) ON DELETE CASCADE, permission_key TEXT NOT NULL REFERENCES permissions(key), PRIMARY KEY(token_id, permission_key));
CREATE TABLE api_token_node_scopes (token_id TEXT NOT NULL REFERENCES api_tokens(id) ON DELETE CASCADE, node_id TEXT NOT NULL, PRIMARY KEY(token_id, node_id));
CREATE TABLE login_attempts (bucket_digest TEXT PRIMARY KEY, failures INTEGER NOT NULL, blocked_until TEXT, updated_at TEXT NOT NULL);
CREATE TABLE system_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, encrypted INTEGER NOT NULL DEFAULT 0 CHECK (encrypted IN (0,1)), key_version INTEGER, updated_at TEXT NOT NULL);
CREATE TABLE encrypted_secrets (key TEXT PRIMARY KEY, key_version INTEGER NOT NULL, nonce BLOB NOT NULL, ciphertext BLOB NOT NULL, tag BLOB NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE agent_enrollments (enrollment_id TEXT PRIMARY KEY, token_digest TEXT NOT NULL, node_name TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, revoked_at TEXT);
CREATE TABLE agent_nodes (node_id TEXT PRIMARY KEY, payload TEXT NOT NULL, revoked_at TEXT, updated_at TEXT NOT NULL);
CREATE TABLE agent_credentials (credential_id TEXT PRIMARY KEY, node_id TEXT NOT NULL REFERENCES agent_nodes(node_id), public_key TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT, replaced_by TEXT, rotation_id TEXT);
CREATE TABLE agent_nonces (credential_id TEXT NOT NULL, nonce TEXT NOT NULL, expires_at TEXT NOT NULL, PRIMARY KEY(credential_id, nonce));
CREATE TABLE remote_tasks (task_id TEXT PRIMARY KEY, node_id TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);
CREATE INDEX remote_tasks_node_status_idx ON remote_tasks(node_id, status);
CREATE TABLE agent_protocol_audits (event_id TEXT PRIMARY KEY, payload TEXT NOT NULL, occurred_at TEXT NOT NULL);
CREATE TABLE audit_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  occurred_at TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  session_id TEXT,
  source TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  action TEXT NOT NULL,
  parameters TEXT NOT NULL,
  outcome TEXT NOT NULL,
  authorization TEXT NOT NULL,
  request_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  previous_hash TEXT NOT NULL,
  event_hash TEXT NOT NULL UNIQUE
);
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit events are append-only'); END;
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit events are append-only'); END;
CREATE TABLE legacy_imports (source_path TEXT PRIMARY KEY, source_digest TEXT NOT NULL, imported_at TEXT NOT NULL);
