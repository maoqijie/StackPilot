import { AUDIT_FAILURE_OUTCOMES, type AuditEvent } from "@stackpilot/contracts";
import { formatBackendDateTime } from "../../utils/time";
import type { AuditRecord } from "./types";

const successOutcomes = /^(success|succeeded|completed)$/i;
function isFailedOutcome(outcome: string) { return (AUDIT_FAILURE_OUTCOMES as readonly string[]).includes(outcome.toLowerCase()); }

function auditRecord(event: AuditEvent): AuditRecord {
  const result = isFailedOutcome(event.outcome) ? "失败" : successOutcomes.test(event.outcome) ? "成功" : "已记录";
  return {
    id: event.eventId,
    time: formatBackendDateTime(event.occurredAt),
    source: event.source,
    user: event.actorId ?? event.actorType,
    actorType: event.actorType,
    action: event.action,
    object: event.targetId ?? event.targetType ?? "Controller",
    targetType: event.targetType ?? "未指定",
    result,
    outcome: event.outcome,
    authorization: event.authorization,
    traceId: event.traceId,
    requestId: event.requestId,
    parameters: event.parameters,
    eventHash: event.eventHash,
    summary: `${event.action} · ${event.outcome}`,
  };
}

function formatAuditParameters(parameters: string) { try { return JSON.stringify(JSON.parse(parameters), null, 2); } catch { return parameters; } }

export { auditRecord, formatAuditParameters, isFailedOutcome };
