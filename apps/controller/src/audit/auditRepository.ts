import { randomUUID } from "node:crypto";
import { AUDIT_FAILURE_OUTCOMES, AUDIT_SUCCESS_OUTCOMES } from "@stackpilot/contracts";
import type Database from "better-sqlite3";
import type { AuditEventsQuery, NodeScope } from "@stackpilot/contracts";
import { hmac } from "../security/crypto.js";

const sensitive = /authorization|cookie|password|token|secret|private|key|environment|stdout|stderr/i;
const limits = { actorType: 64, actorId: 256, source: 512, targetType: 128, targetId: 2_048, action: 256, parameters: 16_384, outcome: 128, authorization: 4_096, requestId: 256, traceId: 256 } as const;
const suffix = "[TRUNCATED]";
function bounded(value: string, limit: number): string { return value.length <= limit ? value : `${value.slice(0, limit - suffix.length)}${suffix}`; }
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, sensitive.test(key) ? "[REDACTED]" : redact(nested)]));
  return typeof value === "string" && value.length > 2048 ? `${value.slice(0, 2048)}[TRUNCATED]` : value;
}
export type AuditInput = { actorType: string; actorId?: string | null; sessionId?: string | null; source: string; targetType?: string | null; targetId?: string | null; action: string; parameters?: unknown; outcome: string; authorization: string; requestId: string; traceId?: string };

export class AuditRepository {
  constructor(private readonly database: Database.Database, private readonly key: Buffer) {}
  append(input: AuditInput): void {
    const previous = this.database.prepare("SELECT event_hash FROM audit_events ORDER BY sequence DESC LIMIT 1").get() as { event_hash: string } | undefined;
    const redacted = redact(input.parameters ?? {});
    const serialized = JSON.stringify(redacted);
    const parameters = serialized.length <= limits.parameters
      ? serialized
      : JSON.stringify({ truncated: true, ...(redacted && typeof redacted === "object" && "nodeId" in redacted && typeof redacted.nodeId === "string" ? { nodeId: bounded(redacted.nodeId, limits.targetId) } : {}) });
    const event = { eventId: randomUUID(), occurredAt: new Date().toISOString(), actorType: bounded(input.actorType, limits.actorType), actorId: input.actorId ? bounded(input.actorId, limits.actorId) : null, sessionId: input.sessionId ?? null, source: bounded(input.source, limits.source), targetType: input.targetType ? bounded(input.targetType, limits.targetType) : null, targetId: input.targetId ? bounded(input.targetId, limits.targetId) : null, action: bounded(input.action, limits.action), parameters, outcome: bounded(input.outcome, limits.outcome), authorization: bounded(input.authorization, limits.authorization), requestId: bounded(input.requestId, limits.requestId), traceId: bounded(input.traceId ?? input.requestId, limits.traceId), previousHash: previous?.event_hash ?? "0".repeat(64) };
    const hash = hmac(this.key, JSON.stringify(event));
    const nodeId = this.resolveNodeId(event, redacted);
    this.database.prepare("INSERT INTO audit_events(event_id,occurred_at,actor_type,actor_id,session_id,source,target_type,target_id,action,parameters,outcome,authorization,request_id,trace_id,previous_hash,event_hash,node_id) VALUES(@eventId,@occurredAt,@actorType,@actorId,@sessionId,@source,@targetType,@targetId,@action,@parameters,@outcome,@authorization,@requestId,@traceId,@previousHash,@hash,@nodeId)").run({ ...event, hash, nodeId });
  }
  verify(): { valid: boolean; count: number; sequence?: number } {
    const rows = this.database.prepare("SELECT * FROM audit_events ORDER BY sequence").all() as Array<Record<string, unknown>>;
    let previousHash = "0".repeat(64);
    for (const row of rows) {
      const event = { eventId: row.event_id, occurredAt: row.occurred_at, actorType: row.actor_type, actorId: row.actor_id, sessionId: row.session_id, source: row.source, targetType: row.target_type, targetId: row.target_id, action: row.action, parameters: row.parameters, outcome: row.outcome, authorization: row.authorization, requestId: row.request_id, traceId: row.trace_id, previousHash: row.previous_hash };
      if (row.previous_hash !== previousHash || row.event_hash !== hmac(this.key, JSON.stringify(event))) return { valid: false, count: rows.length, sequence: row.sequence as number };
      previousHash = row.event_hash as string;
    }
    return { valid: true, count: rows.length };
  }
  listPage(limit = 200, nodeScope: NodeScope = "all", query: AuditEventsQuery = {}) {
    const pageSize = Math.min(limit, 1_000);
    const { where, values } = auditQuery(nodeScope, query, true);
    const rows = this.database.prepare(`SELECT sequence,event_id AS eventId,occurred_at AS occurredAt,actor_type AS actorType,actor_id AS actorId,source,target_type AS targetType,target_id AS targetId,action,parameters,outcome,authorization,request_id AS requestId,trace_id AS traceId,event_hash AS eventHash FROM audit_events ${where} ORDER BY sequence DESC LIMIT ?`).all(...values, pageSize + 1) as Array<Record<string, unknown>>;
    const events = rows.slice(0, pageSize).map(normalizeRow);
    return { events, nextCursor: rows.length > pageSize ? Number(rows[pageSize - 1]?.sequence) : null };
  }
  list(limit = 200, nodeScope: NodeScope = "all", query: AuditEventsQuery = {}) { return this.listPage(limit, nodeScope, query).events; }
  count(nodeScope: NodeScope = "all", query: AuditEventsQuery = {}): number {
    const { where, values } = auditQuery(nodeScope, query, false);
    return (this.database.prepare(`SELECT count(*) AS count FROM audit_events ${where}`).get(...values) as { count: number }).count;
  }
  private resolveNodeId(event: { actorType: string; actorId: string | null; targetType: string | null; targetId: string | null }, parameters: unknown): string | null {
    if (event.targetType === "node" && event.targetId) return event.targetId;
    if (event.actorType === "agent" && event.actorId) return event.actorId.startsWith("agent:") ? event.actorId.slice(6) : event.actorId;
    if (parameters && typeof parameters === "object" && "nodeId" in parameters && typeof parameters.nodeId === "string") return bounded(parameters.nodeId, limits.targetId);
    if (event.targetType !== "remote-task" || !event.targetId) return null;
    return (this.database.prepare("SELECT node_id AS nodeId FROM remote_tasks WHERE task_id=?").get(event.targetId) as { nodeId: string } | undefined)?.nodeId ?? null;
  }
}

function auditQuery(nodeScope: NodeScope, query: AuditEventsQuery, includeCursor: boolean) {
  const clauses: string[] = [];
  const values: Array<string | number> = [];
  if (nodeScope !== "all") {
    if (nodeScope.length === 0) clauses.push("0");
    else { clauses.push(`node_id IN (${nodeScope.map(() => "?").join(",")})`); values.push(...nodeScope); }
  }
  if (includeCursor && query.beforeSequence !== undefined) { clauses.push("sequence < ?"); values.push(query.beforeSequence); }
  if (query.result) {
    const outcomes = query.result === "failure" ? AUDIT_FAILURE_OUTCOMES : AUDIT_SUCCESS_OUTCOMES;
    clauses.push(`lower(outcome) IN (${outcomes.map(() => "?").join(",")})`);
    values.push(...outcomes);
  }
  if (query.actor) { clauses.push("(actor_id = ? OR actor_type = ?)"); values.push(query.actor, query.actor); }
  if (query.source) { clauses.push("(source = ? COLLATE NOCASE OR source LIKE ? ESCAPE '\\' COLLATE NOCASE)"); values.push(query.source, `${escapeLike(query.source)}-%`); }
  if (query.actionPrefix) { clauses.push("action LIKE ? ESCAPE '\\' COLLATE NOCASE"); values.push(`${escapeLike(query.actionPrefix)}%`); }
  if (query.search) {
    const pattern = `%${escapeLike(query.search)}%`;
    clauses.push("(action LIKE ? ESCAPE '\\' COLLATE NOCASE OR target_id LIKE ? ESCAPE '\\' COLLATE NOCASE OR request_id LIKE ? ESCAPE '\\' COLLATE NOCASE OR trace_id LIKE ? ESCAPE '\\' COLLATE NOCASE OR source LIKE ? ESCAPE '\\' COLLATE NOCASE OR actor_id LIKE ? ESCAPE '\\' COLLATE NOCASE)");
    values.push(pattern, pattern, pattern, pattern, pattern, pattern);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", values };
}

function escapeLike(value: string) { return value.replace(/[\\%_]/g, "\\$&"); }

function normalizeRow(row: Record<string, unknown>) {
  return { ...row, actorType: bounded(String(row.actorType), limits.actorType), actorId: row.actorId === null ? null : bounded(String(row.actorId), limits.actorId), source: bounded(String(row.source), limits.source), targetType: row.targetType === null ? null : bounded(String(row.targetType), limits.targetType), targetId: row.targetId === null ? null : bounded(String(row.targetId), limits.targetId), action: bounded(String(row.action), limits.action), parameters: bounded(String(row.parameters), limits.parameters), outcome: bounded(String(row.outcome), limits.outcome), authorization: bounded(String(row.authorization), limits.authorization), requestId: bounded(String(row.requestId), limits.requestId), traceId: bounded(String(row.traceId), limits.traceId) };
}
