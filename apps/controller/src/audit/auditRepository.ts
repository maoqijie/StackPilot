import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { hmac } from "../security/crypto.js";

const sensitive = /authorization|cookie|password|token|secret|private|key|environment|stdout|stderr/i;
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
    const event = { eventId: randomUUID(), occurredAt: new Date().toISOString(), actorType: input.actorType, actorId: input.actorId ?? null, sessionId: input.sessionId ?? null, source: input.source, targetType: input.targetType ?? null, targetId: input.targetId ?? null, action: input.action, parameters: JSON.stringify(redact(input.parameters ?? {})), outcome: input.outcome, authorization: input.authorization, requestId: input.requestId, traceId: input.traceId ?? input.requestId, previousHash: previous?.event_hash ?? "0".repeat(64) };
    const hash = hmac(this.key, JSON.stringify(event));
    this.database.prepare("INSERT INTO audit_events(event_id,occurred_at,actor_type,actor_id,session_id,source,target_type,target_id,action,parameters,outcome,authorization,request_id,trace_id,previous_hash,event_hash) VALUES(@eventId,@occurredAt,@actorType,@actorId,@sessionId,@source,@targetType,@targetId,@action,@parameters,@outcome,@authorization,@requestId,@traceId,@previousHash,@hash)").run({ ...event, hash });
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
  list(limit = 200) { return this.database.prepare("SELECT sequence,event_id AS eventId,occurred_at AS occurredAt,actor_type AS actorType,actor_id AS actorId,source,target_type AS targetType,target_id AS targetId,action,parameters,outcome,authorization,request_id AS requestId,trace_id AS traceId,event_hash AS eventHash FROM audit_events ORDER BY sequence DESC LIMIT ?").all(Math.min(limit, 1000)); }
}

