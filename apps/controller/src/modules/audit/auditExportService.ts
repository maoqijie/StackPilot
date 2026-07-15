import type { AuditExportFormat, AuditExportRecord } from "@stackpilot/contracts";
import type Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { AuditRepository } from "../../audit/auditRepository.js";
import { ServiceError } from "../serviceError.js";

const MAX_EXPORT_ROWS = 50_000;
const MAX_EXPORT_BYTES = 50 * 1024 * 1024;
const EXPORT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1_000;
const MIN_CREATE_INTERVAL_MS = 30_000;
const MAX_ACTIVE_EXPORTS_PER_USER = 20;
const MAX_ACTIVE_EXPORTS_GLOBAL = 100;
const MAX_ACTIVE_BYTES_PER_USER = 250 * 1024 * 1024;
const MAX_ACTIVE_BYTES_GLOBAL = 500 * 1024 * 1024;

type ExportRow = {
  export_id: string; name: string; format: AuditExportFormat; status: "ready" | "failed";
  row_count: number; size_bytes: number; storage_name: string | null; sha256: string | null;
  creator_user_id: string; creator_display_name: string; created_at: string; completed_at: string | null;
  expires_at: string; trace_id: string; error_code: string | null;
};

type AuditRow = {
  sequence: number; event_id: string; occurred_at: string; actor_type: string; actor_id: string | null;
  session_id: string | null; source: string; target_type: string | null; target_id: string | null; action: string;
  parameters: string; outcome: string; authorization: string; request_id: string; trace_id: string;
  previous_hash: string; event_hash: string;
};

export class AuditExportService {
  private readonly maintenanceTimer: NodeJS.Timeout;

  constructor(
    private readonly database: Database.Database,
    private readonly audit: AuditRepository,
    private readonly storageRoot: string,
  ) {
    this.runMaintenance();
    this.maintenanceTimer = setInterval(() => this.runMaintenance(), MAINTENANCE_INTERVAL_MS);
    this.maintenanceTimer.unref();
  }

  shutdown(): void {
    clearInterval(this.maintenanceTimer);
  }

  list(userId: string, includeAll: boolean): { exports: AuditExportRecord[]; collectedAt: string } {
    this.cleanupExpired();
    const now = new Date().toISOString();
    const rows = (includeAll
      ? this.database.prepare("SELECT * FROM audit_exports WHERE expires_at>? ORDER BY created_at DESC LIMIT 200").all(now)
      : this.database.prepare("SELECT * FROM audit_exports WHERE expires_at>? AND creator_user_id=? ORDER BY created_at DESC LIMIT 200").all(now, userId)) as ExportRow[];
    return { exports: rows.map(publicRecord), collectedAt: now };
  }

  create(input: { name: string; format: AuditExportFormat }, actor: { userId: string; displayName: string }, requestId: string): AuditExportRecord {
    this.cleanupExpired();
    this.enforceCapacity(actor.userId);
    const sourceMaxSequence = (this.database.prepare("SELECT coalesce(max(sequence),0) AS value FROM audit_events").get() as { value: number }).value;
    const rowCount = (this.database.prepare("SELECT count(*) AS value FROM audit_events WHERE sequence<=?").get(sourceMaxSequence) as { value: number }).value;
    if (rowCount > MAX_EXPORT_ROWS) throw new ServiceError(413, "PAYLOAD_TOO_LARGE", `审计记录超过 ${MAX_EXPORT_ROWS} 条导出上限`);
    const chain = this.audit.verify();
    if (!chain.valid) throw new ServiceError(409, "BAD_REQUEST", "审计链校验失败，已拒绝生成导出");

    const id = randomUUID();
    const traceId = randomUUID();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + EXPORT_TTL_MS).toISOString();
    const storageName = `${id}.${input.format}`;
    let temporaryPath = "";
    let finalPath = "";
    try {
      const rows = this.database.prepare("SELECT * FROM audit_events WHERE sequence<=? ORDER BY sequence ASC").all(sourceMaxSequence) as AuditRow[];
      const contents = input.format === "csv" ? csvDocument(rows) : jsonDocument(rows, createdAt, sourceMaxSequence);
      const bytes = Buffer.byteLength(contents);
      if (bytes > MAX_EXPORT_BYTES) throw new ServiceError(413, "PAYLOAD_TOO_LARGE", "审计导出超过 50 MiB 文件上限");
      mkdirSync(this.storageRoot, { recursive: true, mode: 0o700 });
      finalPath = this.pathFor(storageName);
      temporaryPath = this.pathFor(`.${id}.tmp`);
      writeFileSync(temporaryPath, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
      renameSync(temporaryPath, finalPath);
      const sha256 = createHash("sha256").update(contents).digest("hex");
      const completedAt = new Date().toISOString();
      this.database.transaction(() => {
        this.database.prepare(`INSERT INTO audit_exports(
          export_id,name,format,status,row_count,size_bytes,storage_name,sha256,creator_user_id,creator_display_name,
          created_at,completed_at,expires_at,trace_id,error_code,source_max_sequence
        ) VALUES(?,?,?,'ready',?,?,?,?,?,?,?,?,?,?,NULL,?)`).run(
          id, input.name, input.format, rowCount, bytes, storageName, sha256, actor.userId, actor.displayName,
          createdAt, completedAt, expiresAt, traceId, sourceMaxSequence,
        );
        this.audit.append({ actorType: "user", actorId: actor.userId, source: "audit-export", targetType: "audit-export", targetId: id, action: "audit.export.created", parameters: { format: input.format, rowCount, sha256 }, outcome: "success", authorization: "session+csrf+reauth+audit:export+full-node-scope", requestId, traceId });
      })();
      return publicRecord(this.row(id));
    } catch (error) {
      if (temporaryPath) rmSync(temporaryPath, { force: true });
      if (finalPath) rmSync(finalPath, { force: true });
      if (error instanceof ServiceError) throw error;
      try {
        this.database.transaction(() => {
          this.database.prepare(`INSERT INTO audit_exports(
            export_id,name,format,status,row_count,size_bytes,storage_name,sha256,creator_user_id,creator_display_name,
            created_at,completed_at,expires_at,trace_id,error_code,source_max_sequence
          ) VALUES(?,?,?,'failed',0,0,NULL,NULL,?,?,?,?,?,'GENERATION_FAILED',?)`).run(
            id, input.name, input.format, actor.userId, actor.displayName, createdAt, new Date().toISOString(), expiresAt, traceId, sourceMaxSequence,
          );
          this.audit.append({ actorType: "user", actorId: actor.userId, source: "audit-export", targetType: "audit-export", targetId: id, action: "audit.export.created", parameters: { format: input.format }, outcome: "failure", authorization: "session+csrf+reauth+audit:export+full-node-scope", requestId, traceId });
        })();
      } catch {
        throw new ServiceError(500, "INTERNAL_ERROR", "审计导出状态未保存");
      }
      return publicRecord(this.row(id));
    }
  }

  retry(id: string, userId: string, includeAll: boolean, actor: { userId: string; displayName: string }, requestId: string): AuditExportRecord {
    const row = this.row(id);
    if ((!includeAll && row.creator_user_id !== userId) || row.status !== "failed") throw new ServiceError(404, "NOT_FOUND", "审计导出不存在");
    return this.create({ name: row.name, format: row.format }, actor, requestId);
  }

  download(id: string, userId: string, includeAll: boolean, requestId: string): { record: AuditExportRecord; contents: Buffer } {
    const row = this.row(id);
    if ((!includeAll && row.creator_user_id !== userId) || row.status !== "ready" || row.expires_at <= new Date().toISOString() || !row.storage_name || !row.sha256) {
      throw new ServiceError(404, "NOT_FOUND", "审计导出不存在");
    }
    const path = this.pathFor(row.storage_name);
    let stat;
    try { stat = lstatSync(path); } catch { throw new ServiceError(404, "NOT_FOUND", "审计导出不存在"); }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== row.size_bytes) throw new ServiceError(404, "NOT_FOUND", "审计导出不存在");
    const contents = readFileSync(path);
    if (createHash("sha256").update(contents).digest("hex") !== row.sha256) throw new ServiceError(404, "NOT_FOUND", "审计导出不存在");
    this.audit.append({ actorType: "user", actorId: userId, source: "audit-export", targetType: "audit-export", targetId: id, action: "audit.export.downloaded", parameters: { format: row.format, rowCount: row.row_count, sha256: row.sha256 }, outcome: "success", authorization: "session+csrf+reauth+audit:export+full-node-scope", requestId, traceId: row.trace_id });
    return { record: publicRecord(row), contents };
  }

  private row(id: string): ExportRow {
    const row = this.database.prepare("SELECT * FROM audit_exports WHERE export_id=?").get(id) as ExportRow | undefined;
    if (!row) throw new ServiceError(404, "NOT_FOUND", "审计导出不存在");
    return row;
  }

  runMaintenance(): void {
    mkdirSync(this.storageRoot, { recursive: true, mode: 0o700 });
    this.cleanupExpired();
    const referenced = new Set((this.database.prepare("SELECT storage_name FROM audit_exports WHERE storage_name IS NOT NULL").all() as Array<{ storage_name: string }>).map((row) => row.storage_name));
    for (const name of readdirSync(this.storageRoot)) {
      if (referenced.has(name) || !/^(?:\.?[0-9a-f-]{36})(?:\.(?:csv|json|tmp))?$/.test(name)) continue;
      const path = this.pathFor(name);
      let stat;
      try { stat = lstatSync(path); } catch { continue; }
      if (stat.isFile() && !stat.isSymbolicLink()) rmSync(path, { force: true });
    }
  }

  private enforceCapacity(userId: string): void {
    const now = new Date().toISOString();
    const last = this.database.prepare("SELECT max(created_at) AS createdAt FROM audit_exports WHERE creator_user_id=?").get(userId) as { createdAt: string | null };
    if (last.createdAt && Date.now() - Date.parse(last.createdAt) < MIN_CREATE_INTERVAL_MS) throw new ServiceError(429, "TOO_MANY_REQUESTS", "审计导出创建过于频繁，请稍后重试");
    const global = this.database.prepare("SELECT count(*) AS count,coalesce(sum(size_bytes),0) AS bytes FROM audit_exports WHERE expires_at>?").get(now) as { count: number; bytes: number };
    const own = this.database.prepare("SELECT count(*) AS count,coalesce(sum(size_bytes),0) AS bytes FROM audit_exports WHERE expires_at>? AND creator_user_id=?").get(now, userId) as { count: number; bytes: number };
    if (global.count >= MAX_ACTIVE_EXPORTS_GLOBAL || global.bytes >= MAX_ACTIVE_BYTES_GLOBAL || own.count >= MAX_ACTIVE_EXPORTS_PER_USER || own.bytes >= MAX_ACTIVE_BYTES_PER_USER) {
      throw new ServiceError(429, "TOO_MANY_REQUESTS", "审计导出容量已达上限，请等待现有文件过期");
    }
  }

  private cleanupExpired(): void {
    const expired = this.database.prepare("SELECT export_id,storage_name FROM audit_exports WHERE expires_at<=?").all(new Date().toISOString()) as Array<{ export_id: string; storage_name: string | null }>;
    for (const row of expired) {
      if (row.storage_name) {
        try { unlinkSync(this.pathFor(row.storage_name)); }
        catch (error) {
          if (!isFileMissing(error)) continue;
        }
      }
      this.database.prepare("DELETE FROM audit_exports WHERE export_id=?").run(row.export_id);
    }
  }

  private pathFor(storageName: string): string {
    if (!/^(?:\.?[0-9a-f-]{36})(?:\.(?:csv|json|tmp))?$/.test(storageName)) throw new ServiceError(404, "NOT_FOUND", "审计导出不存在");
    const root = resolve(this.storageRoot);
    const path = resolve(root, storageName);
    if (!path.startsWith(`${root}${sep}`)) throw new ServiceError(404, "NOT_FOUND", "审计导出不存在");
    return path;
  }
}

function publicRecord(row: ExportRow): AuditExportRecord {
  return { id: row.export_id, name: row.name, format: row.format, status: row.status, rowCount: row.row_count, sizeBytes: row.size_bytes, sha256: row.sha256, createdBy: row.creator_display_name, createdAt: row.created_at, completedAt: row.completed_at, expiresAt: row.expires_at, traceId: row.trace_id, errorCode: row.error_code };
}

function eventRecord(row: AuditRow) {
  let parameters: unknown = row.parameters;
  try { parameters = JSON.parse(row.parameters); } catch { /* Preserve malformed legacy parameters as text. */ }
  return { sequence: row.sequence, eventId: row.event_id, occurredAt: row.occurred_at, actorType: row.actor_type, actorId: row.actor_id, sessionId: row.session_id, source: row.source, targetType: row.target_type, targetId: row.target_id, action: row.action, parameters, outcome: row.outcome, authorization: row.authorization, requestId: row.request_id, traceId: row.trace_id, previousHash: row.previous_hash, eventHash: row.event_hash };
}

function jsonDocument(rows: AuditRow[], createdAt: string, sourceMaxSequence: number): string {
  return `${JSON.stringify({ exportedAt: createdAt, sourceMaxSequence, rowCount: rows.length, events: rows.map(eventRecord) }, null, 2)}\n`;
}

function csvDocument(rows: AuditRow[]): string {
  const headings = ["sequence","eventId","occurredAt","actorType","actorId","sessionId","source","targetType","targetId","action","parameters","outcome","authorization","requestId","traceId","previousHash","eventHash"];
  const records = rows.map((row) => Object.values(eventRecord(row)).map((value) => typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "")));
  return `\uFEFF${[headings, ...records].map((record) => record.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function csvCell(value: string): string {
  const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function isFileMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
