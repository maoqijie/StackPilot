import { createHash } from "node:crypto";
import { DatabaseSlowQueriesPayloadSchema } from "@stackpilot/contracts";
import type { DatabaseSlowQueriesPayload, DatabaseSlowQueryRecord } from "@stackpilot/contracts";
import { runFixedCommand } from "./commandRunner.js";
import type { CommandResult } from "./types.js";

type PostgresSnapshot = { version: string; port: number; databases: Array<{ name: string; connections: number }>; queries: Array<{ pid: number; database: string; owner: string | null; sql: string; durationMs: number; startedAt: string; queryId: string | null; waitEventType: string | null; waitEvent: string | null }> };
type CommandRunner = (executable: string, args: readonly string[], options?: { timeoutMs?: number; maxBuffer?: number }) => Promise<CommandResult>;
const SQL = `WITH database_connections AS (
  SELECT d.datname AS name, count(a.pid)::int AS connections FROM pg_database d LEFT JOIN pg_stat_activity a ON a.datid = d.oid
  WHERE d.datallowconn AND NOT d.datistemplate GROUP BY d.datname
), slow_queries AS (
  SELECT pid, datname AS database, usename AS owner, query AS sql, floor(extract(epoch FROM (clock_timestamp() - query_start)) * 1000)::bigint AS duration_ms,
    query_start, query_id::text, wait_event_type, wait_event FROM pg_stat_activity
  WHERE pid <> pg_backend_pid() AND backend_type = 'client backend' AND state = 'active' AND query_start IS NOT NULL
    AND clock_timestamp() - query_start >= interval '1 second'
  ORDER BY duration_ms DESC LIMIT 100
)
SELECT json_build_object('version', current_setting('server_version'), 'port', current_setting('port')::int,
  'databases', coalesce((SELECT json_agg(json_build_object('name', name, 'connections', connections) ORDER BY name) FROM database_connections), '[]'::json),
  'queries', coalesce((SELECT json_agg(json_build_object('pid', pid, 'database', database, 'owner', owner, 'sql', left(sql, 4000), 'durationMs', duration_ms,
    'startedAt', query_start, 'queryId', query_id, 'waitEventType', wait_event_type, 'waitEvent', wait_event) ORDER BY duration_ms DESC) FROM slow_queries), '[]'::json));`;

function normalizeSql(sql: string) { return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\r\n]*/g, " ").replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, "$tag$?$tag$").replace(/'(?:''|[^'])*'/g, "'?'").replace(/\b\d+(?:\.\d+)?\b/g, "?").replace(/\s+/g, " ").trim().slice(0, 2_000); }
function instanceId(database: string) { return `postgres-local-${createHash("sha256").update(database).digest("hex").slice(0, 16)}`; }
function queryRecord(query: PostgresSnapshot["queries"][number], collectedAt: string): DatabaseSlowQueryRecord {
  const sql = normalizeSql(query.sql) || "查询文本不可用";
  const fingerprint = query.queryId ? `pg-${query.queryId}` : `pg-${createHash("sha256").update(sql).digest("hex").slice(0, 24)}`;
  const waitEvent = [query.waitEventType, query.waitEvent].filter(Boolean).join(" / ") || null;
  return { id: `postgres-${query.pid}-${fingerprint}`, instanceId: instanceId(query.database), database: query.database, fingerprint, sql,
    durationMs: Math.max(0, Math.round(query.durationMs)), calls: null, p95Ms: null, rowsExamined: null,
    risk: query.durationMs >= 30_000 ? "high" : query.durationMs >= 5_000 ? "medium" : "low", state: waitEvent ? "waiting" : "active",
    owner: query.owner, startedAt: new Date(query.startedAt).toISOString(), lastSeenAt: collectedAt, sessionId: String(query.pid), waitEvent };
}

export class PostgresSlowQueryCollector {
  constructor(private readonly runner: CommandRunner = runFixedCommand) {}
  async collect(): Promise<DatabaseSlowQueriesPayload> {
    const collectedAt = new Date().toISOString();
    const result = await this.runner("/usr/bin/psql", ["-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--tuples-only", "--no-align", "--dbname", "postgres", "--command", SQL], { timeoutMs: 3_000, maxBuffer: 2 * 1024 * 1024 });
    if (!result.ok) return DatabaseSlowQueriesPayloadSchema.parse({ collectedAt, collectionStatus: "unavailable", warnings: ["PostgreSQL 慢查询统计暂不可用"], thresholdMs: 1_000, instances: [], queries: [] });
    try {
      const snapshot = JSON.parse(result.stdout) as PostgresSnapshot;
      const queries = snapshot.queries.map((query) => queryRecord(query, collectedAt));
      const instances = snapshot.databases.map((database) => ({ id: instanceId(database.name), name: database.name, engine: `PostgreSQL ${snapshot.version}`, host: "Controller 本机", port: snapshot.port, activeConnections: database.connections, slowQueryCount: queries.filter((query) => query.database === database.name).length, collectedAt }));
      return DatabaseSlowQueriesPayloadSchema.parse({ collectedAt, collectionStatus: "complete", warnings: [], thresholdMs: 1_000, instances, queries });
    } catch { return DatabaseSlowQueriesPayloadSchema.parse({ collectedAt, collectionStatus: "unavailable", warnings: ["PostgreSQL 返回了无法解析的慢查询统计"], thresholdMs: 1_000, instances: [], queries: [] }); }
  }
}

export { normalizeSql };
