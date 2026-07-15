import type { AuditEvent } from "@stackpilot/contracts";
import { formatBackendDateTime } from "../../utils/time";
import type { AuditRecord } from "./types";

const failureOutcomes = /^(failed|failure|denied|error|rejected|expired|cancelled|canceled)$/i;
const successOutcomes = /^(success|succeeded|completed)$/i;

export function auditRecord(event: AuditEvent): AuditRecord {
  const result = failureOutcomes.test(event.outcome) ? "失败" : successOutcomes.test(event.outcome) ? "成功" : "已记录";
  return { id: event.eventId, time: formatBackendDateTime(event.occurredAt), source: event.source, user: event.actorId ?? event.actorType, actorType: event.actorType, action: event.action, object: event.targetId ?? event.targetType ?? "Controller", targetType: event.targetType ?? "未指定", result, outcome: event.outcome, traceId: event.traceId, requestId: event.requestId, parameters: event.parameters, summary: `${event.action} · ${event.outcome}` };
}
