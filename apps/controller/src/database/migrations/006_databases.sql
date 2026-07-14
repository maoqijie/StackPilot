CREATE TABLE database_instances (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES agent_nodes(node_id) ON DELETE CASCADE,
  local_id TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  managed INTEGER NOT NULL CHECK(managed IN (0,1)),
  collected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(node_id, local_id)
);
CREATE INDEX database_instances_node_idx ON database_instances(node_id, collected_at DESC);

CREATE TABLE database_sessions (
  id TEXT NOT NULL,
  instance_id TEXT NOT NULL REFERENCES database_instances(id) ON DELETE CASCADE,
  snapshot TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  PRIMARY KEY(instance_id, id)
);

CREATE TABLE database_slow_queries (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES database_instances(id) ON DELETE CASCADE,
  metadata TEXT NOT NULL,
  sql_key_version INTEGER,
  sql_nonce BLOB,
  sql_ciphertext BLOB,
  sql_tag BLOB,
  sql_expires_at TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX database_slow_queries_instance_time_idx ON database_slow_queries(instance_id, last_seen_at DESC);
CREATE INDEX database_slow_queries_expiry_idx ON database_slow_queries(sql_expires_at);

CREATE TABLE database_backup_plans (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES database_instances(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cron TEXT NOT NULL,
  retention_count INTEGER NOT NULL CHECK(retention_count BETWEEN 1 AND 30),
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE database_backup_jobs (
  id TEXT PRIMARY KEY,
  plan_id TEXT REFERENCES database_backup_plans(id) ON DELETE SET NULL,
  instance_id TEXT NOT NULL REFERENCES database_instances(id) ON DELETE CASCADE,
  operation_id TEXT UNIQUE,
  scheduled_report_id TEXT UNIQUE,
  scheduled_report_hash TEXT,
  status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed','cancelled')),
  started_at TEXT,
  completed_at TEXT,
  size_bytes INTEGER CHECK(size_bytes IS NULL OR size_bytes >= 0),
  error_code TEXT,
  manifest_version INTEGER,
  checksum TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX database_backup_jobs_instance_time_idx ON database_backup_jobs(instance_id, created_at DESC);

CREATE TABLE database_restore_points (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES database_backup_jobs(id) ON DELETE CASCADE,
  instance_id TEXT NOT NULL REFERENCES database_instances(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
  checksum TEXT NOT NULL,
  database_version TEXT NOT NULL,
  manifest_version INTEGER NOT NULL,
  verified_at TEXT,
  drill_status TEXT NOT NULL CHECK(drill_status IN ('not_started','succeeded','failed')),
  drilled_at TEXT
);

CREATE TABLE database_operation_plans (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  node_id TEXT NOT NULL REFERENCES agent_nodes(node_id),
  instance_id TEXT REFERENCES database_instances(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  target TEXT NOT NULL,
  impact TEXT NOT NULL,
  parameters_key_version INTEGER NOT NULL,
  parameters_nonce BLOB NOT NULL,
  parameters_ciphertext BLOB NOT NULL,
  parameters_tag BLOB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  executed_at TEXT
);

CREATE TABLE database_operations (
  id TEXT PRIMARY KEY,
  plan_id TEXT REFERENCES database_operation_plans(id),
  node_id TEXT NOT NULL REFERENCES agent_nodes(node_id),
  instance_id TEXT REFERENCES database_instances(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed','cancelled')),
  version INTEGER NOT NULL DEFAULT 1,
  requested_by TEXT NOT NULL REFERENCES users(id),
  request_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  context_key_version INTEGER,
  context_nonce BLOB,
  context_ciphertext BLOB,
  context_tag BLOB,
  credential_ciphertext TEXT,
  credential_expires_at TEXT,
  result_key_version INTEGER,
  result_nonce BLOB,
  result_ciphertext BLOB,
  result_tag BLOB,
  result_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  expires_at TEXT NOT NULL,
  UNIQUE(requested_by, idempotency_key)
);
CREATE INDEX database_operations_node_time_idx ON database_operations(node_id, created_at DESC);

INSERT OR IGNORE INTO permissions(key,risk,description) VALUES
  ('databases:read','low','读取数据库实例、备份与脱敏查询状态'),
  ('databases:sql:read','high','读取数据库完整 SQL 文本'),
  ('databases:backup','high','管理和执行数据库备份计划'),
  ('databases:operate','high','执行数据库会话和查询治理操作'),
  ('databases:install','high','安装和创建数据库实例'),
  ('databases:restore','high','执行数据库原地恢复');
INSERT OR IGNORE INTO roles(id,name,description,builtin,created_at)
VALUES('administrator','管理员','管理员内置角色',1,CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO role_permissions(role_id,permission_key)
SELECT 'administrator', key FROM permissions WHERE key IN (
  'databases:read','databases:sql:read','databases:backup','databases:operate','databases:install','databases:restore'
);

UPDATE release_metadata
SET application_version = '0.3.0-preview.1',
    schema_version = 6,
    upgraded_at = CURRENT_TIMESTAMP
WHERE singleton = 1;
