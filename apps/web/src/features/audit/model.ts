import { AUDIT_FAILURE_OUTCOMES } from "@stackpilot/contracts";
import type { AuditEvent } from "../../api/auditApi";
import type { AuditRecord } from "./types";

function isFailedOutcome(outcome: string) {
  return (AUDIT_FAILURE_OUTCOMES as readonly string[]).includes(outcome.toLowerCase());
}

function auditRecord(event: AuditEvent): AuditRecord {
  return {
    id: event.eventId,
    time: new Date(event.occurredAt).toLocaleString("zh-CN", { hour12: false }),
    source: event.source,
    user: event.actorId ?? event.actorType,
    action: event.action,
    object: event.targetId ?? event.targetType ?? "系统",
    result: isFailedOutcome(event.outcome) ? "失败" : "成功",
    outcome: event.outcome,
    authorization: event.authorization,
    parameters: event.parameters,
    requestId: event.requestId,
    traceId: event.traceId,
    summary: `${event.action} · ${event.outcome}`,
  };
}

function downloadAuditCsv(rows: AuditRecord[]) {
  const escape = (value: string) => {
    const safeValue = /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
    return `"${safeValue.replaceAll('"', '""')}"`;
  };
  const csvRows = [
    ["时间", "来源", "用户", "动作", "对象", "结果", "原始结果", "trace id"],
    ...rows.map((row) => [row.time, row.source, row.user, row.action, row.object, row.result, row.outcome, row.traceId]),
  ];
  const blob = new Blob([`\uFEFF${csvRows.map((row) => row.map(escape).join(",")).join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `stackpilot-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export { auditRecord, downloadAuditCsv, isFailedOutcome };
