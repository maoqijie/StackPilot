CREATE TABLE IF NOT EXISTS managed_sites (
  site_id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  domain_digest TEXT NOT NULL UNIQUE,
  desired_state TEXT NOT NULL CHECK(desired_state IN ('running','stopped','deleted')),
  protected INTEGER NOT NULL DEFAULT 0 CHECK(protected IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  active_release_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS managed_sites_node_idx ON managed_sites(node_id, desired_state);

CREATE TABLE IF NOT EXISTS site_plans (
  plan_id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,
  digest TEXT NOT NULL,
  idempotency_digest TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS site_plans_node_status_idx ON site_plans(node_id, status);

CREATE TABLE IF NOT EXISTS site_operations (
  operation_id TEXT PRIMARY KEY,
  task_id TEXT UNIQUE,
  node_id TEXT NOT NULL,
  site_id TEXT,
  plan_id TEXT REFERENCES site_plans(plan_id),
  operation_type TEXT NOT NULL,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  progress_percent INTEGER NOT NULL CHECK(progress_percent BETWEEN 0 AND 100),
  payload TEXT NOT NULL,
  result TEXT,
  error_code TEXT,
  idempotency_digest TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS site_operations_node_status_idx ON site_operations(node_id, status);

CREATE TABLE IF NOT EXISTS site_releases (
  release_id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES managed_sites(site_id),
  plan_id TEXT NOT NULL REFERENCES site_plans(plan_id),
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  activated_at TEXT
);
CREATE INDEX IF NOT EXISTS site_releases_site_idx ON site_releases(site_id, created_at DESC);

CREATE TABLE IF NOT EXISTS site_environment_references (
  plan_id TEXT NOT NULL REFERENCES site_plans(plan_id) ON DELETE CASCADE,
  variable_name TEXT NOT NULL,
  secret_key TEXT NOT NULL,
  PRIMARY KEY(plan_id, variable_name)
);

UPDATE release_metadata SET application_version = '0.3.0-preview.1', schema_version = 7, upgraded_at = CURRENT_TIMESTAMP WHERE singleton = 1;
