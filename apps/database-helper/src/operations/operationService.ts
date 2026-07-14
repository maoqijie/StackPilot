import {
  AgentDatabaseOperationDispatchSchema, AgentDatabaseOperationUpdateSchema,
  type AgentDatabaseOperationDispatch, type AgentDatabaseOperationUpdate,
} from "@stackpilot/contracts";
import { HelperError } from "../domain.js";
import type { DatabaseRegistry } from "../state/registry.js";
import type { QueryClient } from "../collection/queryClient.js";
import type { DatabaseBackupService } from "./backup.js";
import type { OperationJournal } from "../state/operationJournal.js";
import type { DatabaseProvisioner } from "./provisioner.js";
import type { DatabaseRestoreService } from "./restore.js";

const quotePg = (value: string) => `"${value.replaceAll('"', '""')}"`;
const quoteMysql = (value: string) => `\`${value.replaceAll("`", "``")}\``;
const rejectStatements = /(?:;|--|\/\*|\*\/|\b(?:insert|update|delete|drop|alter|create|grant|revoke|copy|call|do|set|reset|vacuum|analyze|refresh|truncate)\b)/i;

export class DatabaseOperationService {
  private readonly running = new Set<string>();
  constructor(
    private readonly registry: DatabaseRegistry, private readonly queries: QueryClient,
    private readonly backups: DatabaseBackupService, private readonly journal: OperationJournal,
    private readonly provisioner: DatabaseProvisioner, private readonly restores: DatabaseRestoreService,
  ) {}
  async execute(raw: unknown): Promise<AgentDatabaseOperationUpdate> {
    const operation = AgentDatabaseOperationDispatchSchema.parse(raw);
    const cached = await this.journal.begin(operation); if (cached) return cached;
    if (Date.parse(operation.expiresAt) <= Date.now()) return this.reject(operation, "OPERATION_EXPIRED", "数据库操作已过期");
    if (this.running.has(operation.operationId)) return this.reject(operation, "OPERATION_IN_PROGRESS", "数据库操作正在执行");
    this.running.add(operation.operationId);
    try {
      const credentials = operation.parameters.kind === "install" ? null : await this.registry.credential(operation.parameters.instanceLocalId);
      const instance = operation.parameters.kind === "install" ? null : await this.registry.get(operation.parameters.instanceLocalId);
      let credentialEnvelope = null; let result = null;
      switch (operation.parameters.kind) {
        case "install": {
          const installed = await this.provisioner.install(operation.parameters); credentialEnvelope = installed.credentialEnvelope;
          result = { kind: "install" as const, instanceLocalId: installed.result.localInstanceId, engine: installed.result.engine, port: installed.result.port, serviceName: installed.result.serviceName };
          break;
        }
        case "restore": {
          const restored = await this.restores.restore(instance!, credentials!, operation.parameters.restorePointId);
          result = { kind: "restore" as const, restorePointId: restored.recoveryPointId, health: "healthy" as const, rollbackExpiresAt: restored.rollbackExpiresAt };
          break;
        }
        case "backup": {
          const manifest = await this.backups.create(instance!, credentials!, operation.parameters.retentionCount);
          const totalBytes = manifest.files.reduce((sum, file) => sum + file.sizeBytes, 0);
          const checksum = (await import("node:crypto")).createHash("sha256").update(JSON.stringify(manifest, null, 2)).digest("hex");
          result = { kind: "backup" as const, restorePointId: manifest.id, createdAt: manifest.createdAt, sizeBytes: totalBytes, checksum, databaseVersion: manifest.databaseVersion ?? "unknown", manifestVersion: manifest.version };
          break;
        }
        case "set-read-only": await this.setReadOnly(instance!, credentials!, true); break;
        case "set-read-write": await this.setReadOnly(instance!, credentials!, false); break;
        case "terminate-session": await this.terminate(instance!, credentials!, operation.parameters.sessionId); break;
        case "explain": result = { kind: "explain" as const, ...await this.explain(instance!, credentials!, operation.parameters.sql) }; break;
        case "create-index": await this.createIndex(instance!, credentials!, operation.parameters.table, operation.parameters.columns); break;
      }
      const update = AgentDatabaseOperationUpdateSchema.parse({ operationId: operation.operationId, version: operation.version, status: "succeeded", errorCode: null, errorMessage: null, credentialEnvelope, result, updatedAt: new Date().toISOString() }); await this.journal.complete(operation, update); return update;
    } catch (error) {
      const known = error instanceof HelperError; const update = this.failed(operation, known ? error.code : "OPERATION_FAILED", known ? error.message : "数据库操作失败"); await this.journal.complete(operation, update); return update;
    } finally { this.running.delete(operation.operationId); }
  }
  private async setReadOnly(instance: Awaited<ReturnType<DatabaseRegistry["get"]>>, credential: Awaited<ReturnType<DatabaseRegistry["credential"]>>, readonly: boolean) {
    const sql = instance.engine === "postgresql" ? `ALTER SYSTEM SET default_transaction_read_only = ${readonly ? "on" : "off"}; SELECT pg_reload_conf();`
      : instance.engine === "mysql" ? `SET GLOBAL read_only = ${readonly ? "ON" : "OFF"}; SET GLOBAL super_read_only = ${readonly ? "ON" : "OFF"}`
        : `SET GLOBAL read_only = ${readonly ? "ON" : "OFF"}`;
    await this.queries.execute(instance, credential, sql, 10_000);
  }
  private async terminate(instance: Awaited<ReturnType<DatabaseRegistry["get"]>>, credential: Awaited<ReturnType<DatabaseRegistry["credential"]>>, sessionId: string) {
    if (!/^\d+$/.test(sessionId)) throw new HelperError("INVALID_SESSION", "会话 ID 无效");
    const rows = await this.queries.query<Array<{ id: string; protected: boolean }>>(instance, credential, instance.engine === "postgresql"
      ? `SELECT coalesce(json_agg(x),'[]'::json)::text FROM (SELECT pid::text id,(backend_type <> 'client backend' OR usename IN ('postgres','stackpilot')) protected FROM pg_stat_activity WHERE pid=${sessionId}::int AND pid<>pg_backend_pid()) x`
      : `SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT('id',CAST(id AS CHAR),'protected',IF(user IN ('system user','event_scheduler','mysql.session','stackpilot'),TRUE,FALSE))),JSON_ARRAY()) FROM information_schema.processlist WHERE id=${sessionId} AND id<>CONNECTION_ID()`);
    if (rows.length !== 1) throw new HelperError("SESSION_NOT_FOUND", "数据库会话不存在");
    if (rows[0]!.protected) throw new HelperError("PROTECTED_SESSION", "禁止终止系统、复制、维护或 helper 会话");
    await this.queries.execute(instance, credential, instance.engine === "postgresql" ? `SELECT pg_terminate_backend(${sessionId}::int)` : `KILL CONNECTION ${sessionId}`);
  }
  private async explain(instance: Awaited<ReturnType<DatabaseRegistry["get"]>>, credential: Awaited<ReturnType<DatabaseRegistry["credential"]>>, sql: string) {
    const normalized = sql.trim(); if (!/^(?:select|with)\b/i.test(normalized) || rejectStatements.test(normalized)) throw new HelperError("EXPLAIN_SQL_DENIED", "Explain 只接受单条只读 SELECT/CTE");
    const statement = instance.engine === "postgresql" ? `BEGIN READ ONLY; SET LOCAL statement_timeout='5s'; EXPLAIN (FORMAT JSON) ${normalized}; ROLLBACK`
      : `SET SESSION MAX_EXECUTION_TIME=5000; START TRANSACTION READ ONLY; EXPLAIN FORMAT=JSON ${normalized}; ROLLBACK`;
    const plan = await this.queries.execute(instance, credential, statement, 8_000);
    if (!plan.trim()) throw new HelperError("EXPLAIN_EMPTY", "数据库未返回 Explain 计划");
    if (Buffer.byteLength(plan, "utf8") > 256 * 1024) throw new HelperError("EXPLAIN_RESULT_LIMIT", "Explain 计划超过 256 KiB 限制");
    const trimmed = plan.trim(); let format: "json" | "text" = "text"; try { JSON.parse(trimmed); format = "json"; } catch { /* Some clients return command tags around the JSON plan. */ }
    return { format, plan: trimmed };
  }
  private async createIndex(instance: Awaited<ReturnType<DatabaseRegistry["get"]>>, credential: Awaited<ReturnType<DatabaseRegistry["credential"]>>, table: string, columns: string[]) {
    const quote = instance.engine === "postgresql" ? quotePg : quoteMysql; const name = `sp_${table}_${columns.join("_")}`.slice(0, instance.engine === "postgresql" ? 63 : 64);
    const sql = instance.engine === "postgresql" ? `CREATE INDEX CONCURRENTLY ${quote(name)} ON ${quote(table)} (${columns.map(quote).join(", ")})`
      : `CREATE INDEX ${quote(name)} ON ${quote(table)} (${columns.map(quote).join(", ")}) ALGORITHM=INPLACE LOCK=NONE`;
    await this.queries.execute(instance, credential, sql, 30 * 60_000);
  }
  private failed(operation: AgentDatabaseOperationDispatch, code: string, message: string) {
    return AgentDatabaseOperationUpdateSchema.parse({ operationId: operation.operationId, version: operation.version, status: "failed", errorCode: code, errorMessage: message, credentialEnvelope: null, result: null, updatedAt: new Date().toISOString() });
  }
  private async reject(operation: AgentDatabaseOperationDispatch, code: string, message: string) {
    const update = this.failed(operation, code, message); await this.journal.complete(operation, update); return update;
  }
}
