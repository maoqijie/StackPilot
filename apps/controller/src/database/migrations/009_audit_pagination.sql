ALTER TABLE audit_events ADD COLUMN node_id TEXT;

DROP TRIGGER audit_events_no_update;
UPDATE audit_events
SET node_id = CASE
  WHEN target_type = 'node' AND target_id IS NOT NULL THEN target_id
  WHEN actor_type = 'agent' AND actor_id IS NOT NULL THEN
    CASE WHEN actor_id LIKE 'agent:%' THEN substr(actor_id, 7) ELSE actor_id END
  WHEN json_valid(parameters) AND json_type(parameters, '$.nodeId') = 'text' THEN json_extract(parameters, '$.nodeId')
  WHEN target_type = 'remote-task' AND target_id IS NOT NULL THEN
    (SELECT node_id FROM remote_tasks WHERE task_id = audit_events.target_id)
  ELSE NULL
END;
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit events are append-only'); END;

CREATE INDEX audit_events_node_sequence_idx ON audit_events(node_id, sequence DESC);
CREATE INDEX audit_events_actor_sequence_idx ON audit_events(actor_id, sequence DESC);
CREATE INDEX audit_events_source_sequence_idx ON audit_events(source, sequence DESC);
CREATE INDEX audit_events_outcome_sequence_idx ON audit_events(lower(outcome), sequence DESC);

UPDATE release_metadata
SET schema_version = 9, upgraded_at = CURRENT_TIMESTAMP
WHERE singleton = 1;
