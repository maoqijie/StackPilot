ALTER TABLE site_plans
  ADD COLUMN deployment_environment TEXT NOT NULL DEFAULT 'production'
  CHECK(deployment_environment IN ('production','staging'));

UPDATE site_plans
SET deployment_environment = CASE
  WHEN json_extract(payload, '$.deploymentEnvironment') = 'staging' THEN 'staging'
  WHEN lower(json_extract(payload, '$.repositoryRef')) IN ('staging','stage','rc','release') THEN 'staging'
  WHEN lower(json_extract(payload, '$.repositoryRef')) GLOB 'staging/*'
    OR lower(json_extract(payload, '$.repositoryRef')) GLOB 'stage/*'
    OR lower(json_extract(payload, '$.repositoryRef')) GLOB 'rc/*'
    OR lower(json_extract(payload, '$.repositoryRef')) GLOB 'release/*'
    OR lower(json_extract(payload, '$.repositoryRef')) GLOB 'staging-*'
    OR lower(json_extract(payload, '$.repositoryRef')) GLOB 'stage-*'
    OR lower(json_extract(payload, '$.repositoryRef')) GLOB 'rc-*'
    OR lower(json_extract(payload, '$.repositoryRef')) GLOB 'release-*'
  THEN 'staging'
  ELSE 'production'
END;

UPDATE site_plans
SET payload = json_set(payload, '$.deploymentEnvironment', deployment_environment);

CREATE INDEX site_operations_plan_type_created_idx
  ON site_operations(plan_id, created_at DESC, operation_id DESC, node_id)
  WHERE plan_id IS NOT NULL AND operation_type IN ('prepare','activate');

UPDATE release_metadata
SET schema_version = 8, upgraded_at = CURRENT_TIMESTAMP
WHERE singleton = 1;
