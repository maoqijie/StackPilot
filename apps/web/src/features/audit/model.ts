import { AUDIT_FAILURE_OUTCOMES, type AuditEvent } from "@stackpilot/contracts";
import { formatBackendDateTime } from "../../utils/time";
import type { AuditRecord } from "./types";

const successOutcomes = /^(success|succeeded|completed)$/i;
function isFailedOutcome(outcome: string) { return (AUDIT_FAILURE_OUTCOMES as readonly string[]).includes(outcome.toLowerCase()); }

function auditRecord(event: AuditEvent): AuditRecord {
  const result = isFailedOutcome(event.outcome) ? "失败" : successOutcomes.test(event.outcome) ? "成功" : "已记录";
  return { id: event.eventId, time: formatBackendDateTime(event.occurredAt), source: event.source, user: event.actorId ?? event.actorType, actorType: event.actorType, action: event.action, object: event.targetId ?? event.targetType ?? "Controller", targetType: event.targetType ?? "未指定", result, outcome: event.outcome, authorization: event.authorization, traceId: event.traceId, requestId: event.requestId, parameters: event.parameters, summary: `${event.action} · ${event.outcome}` };
}

function csvCell(value: string) {
  const safe = /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function downloadAuditCsv(rows: AuditRecord[]) {
  const values = [
    ["时间", "来源", "操作者", "操作者类型", "动作", "对象", "对象类型", "结果", "原始结果", "授权", "请求 ID", "Trace ID"],
    ...rows.map((row) => [row.time, row.source, row.user, row.actorType, row.action, row.object, row.targetType, row.result, row.outcome, row.authorization, row.requestId, row.traceId]),
  ];
  const url = URL.createObjectURL(new Blob([`\uFEFF${values.map((row) => row.map(csvCell).join(",")).join("\r\n")}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `stackpilot-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function formatAuditParameters(parameters: string) { try { return JSON.stringify(JSON.parse(parameters), null, 2); } catch { return parameters; } }

export { auditRecord, downloadAuditCsv, formatAuditParameters, isFailedOutcome };
