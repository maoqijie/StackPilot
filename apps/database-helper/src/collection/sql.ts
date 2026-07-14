export const postgresInventorySql = `SELECT json_build_object(
  'version', current_setting('server_version'),
  'storageBytes', COALESCE((SELECT sum(pg_database_size(datname)) FROM pg_database WHERE datallowconn AND NOT datistemplate),0),
  'activeConnections', (SELECT count(*) FROM pg_stat_activity),
  'maxConnections', current_setting('max_connections')::int,
  'accessMode', CASE WHEN current_setting('default_transaction_read_only')::boolean THEN 'read-only' ELSE 'read-write' END
)::text`;

export const postgresQueriesSql = `SELECT json_build_object(
  'sessions', COALESCE((SELECT json_agg(row_to_json(s)) FROM (
    SELECT pid::text id, datname database, usename username, NULLIF(application_name,'') "applicationName",
      host(client_addr) "clientAddress", CASE WHEN wait_event IS NOT NULL THEN 'waiting' WHEN state='active' THEN 'active' WHEN state LIKE 'idle%' THEN 'idle' ELSE 'unknown' END state,
      backend_start "startedAt", xact_start "transactionStartedAt",
      (backend_type <> 'client backend' OR usename IN ('postgres','stackpilot')) protected,
      CASE WHEN backend_type <> 'client backend' THEN backend_type WHEN usename IN ('postgres','stackpilot') THEN 'system-or-helper-user' ELSE NULL END "protectedReason"
    FROM pg_stat_activity WHERE pid <> pg_backend_pid() ORDER BY backend_start DESC LIMIT 1000
  ) s), '[]'::json),
  'queries', COALESCE((SELECT json_agg(row_to_json(q)) FROM (
    SELECT md5(query || coalesce(datname,'')) id, datname database, md5(query) fingerprint, query sql,
      floor(extract(epoch FROM (clock_timestamp()-query_start))*1000)::bigint "durationMs",
      CASE WHEN extract(epoch FROM (clock_timestamp()-query_start))*1000 >= 10000 THEN 'high' WHEN extract(epoch FROM (clock_timestamp()-query_start))*1000 >= 3000 THEN 'medium' ELSE 'low' END risk,
      CASE WHEN wait_event IS NOT NULL THEN 'waiting' ELSE 'active' END state, usename owner,
      query_start "startedAt", clock_timestamp() "lastSeenAt", pid::text "sessionId", wait_event "waitEvent"
    FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND state='active' AND query_start IS NOT NULL
      AND clock_timestamp()-query_start >= interval '1 second' ORDER BY query_start LIMIT 1000
  ) q), '[]'::json)
)::text`;

export const mysqlInventorySql = `SELECT JSON_OBJECT(
  'version', VERSION(), 'storageBytes', COALESCE((SELECT SUM(data_length+index_length) FROM information_schema.tables),0),
  'activeConnections', (SELECT COUNT(*) FROM information_schema.processlist),
  'maxConnections', @@max_connections, 'accessMode', IF(@@global.read_only=1,'read-only','read-write')
)`;

export const mysqlQueriesSql = `SELECT JSON_OBJECT(
  'sessions', COALESCE((SELECT JSON_ARRAYAGG(JSON_OBJECT(
    'id', CAST(id AS CHAR), 'database', db, 'username', user, 'applicationName', NULL,
    'clientAddress', NULL,
    'state', IF(command='Sleep','idle',IF(state IS NULL,'active','waiting')),
    'startedAt', NULL, 'transactionStartedAt', NULL,
    'protected', IF(user IN ('system user','event_scheduler','mysql.session','stackpilot'),TRUE,FALSE),
    'protectedReason', IF(user IN ('system user','event_scheduler','mysql.session','stackpilot'),'system-or-helper-user',NULL)
  )) FROM (SELECT * FROM information_schema.processlist WHERE id <> CONNECTION_ID() ORDER BY time DESC LIMIT 1000) s), JSON_ARRAY()),
  'queries', COALESCE((SELECT JSON_ARRAYAGG(JSON_OBJECT(
    'id', SHA2(CONCAT(id,info),256), 'database', COALESCE(db,'unknown'), 'fingerprint', SHA2(info,256), 'sql', info,
    'durationMs', time*1000, 'risk', IF(time>=10,'high',IF(time>=3,'medium','low')),
    'state', IF(state IS NULL,'active','waiting'), 'owner', user, 'startedAt', DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(3),INTERVAL time SECOND),'%Y-%m-%dT%H:%i:%s.000Z'),
    'lastSeenAt', DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ'), 'sessionId', CAST(id AS CHAR), 'waitEvent', state
  )) FROM (SELECT * FROM information_schema.processlist WHERE id <> CONNECTION_ID() AND command <> 'Sleep' AND info IS NOT NULL AND time >= 1 ORDER BY time DESC LIMIT 1000) q), JSON_ARRAY())
)`;
