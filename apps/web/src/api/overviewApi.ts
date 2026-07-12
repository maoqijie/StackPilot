import type {
  ApiNotice,
  OverviewHealthPayload,
  OverviewRisksPayload,
  OverviewSummaryPayload,
  OverviewTasksPayload,
} from "@stackpilot/contracts";
import { OverviewHealthPayloadSchema, OverviewRisksPayloadSchema, OverviewSummaryPayloadSchema, OverviewTasksPayloadSchema } from "@stackpilot/contracts";
import { requestJson } from "./client";

export type * from "@stackpilot/contracts";

export function fetchOverview(signal?: AbortSignal) {
  return requestJson<OverviewSummaryPayload>("/overview", { signal }).then((payload) => OverviewSummaryPayloadSchema.parse(payload));
}

export function refreshOverview() {
  return requestJson<OverviewSummaryPayload>("/overview/refresh", { method: "POST" });
}

export function checkOverviewUpdates() {
  return requestJson<ApiNotice & { overview: OverviewSummaryPayload }>("/overview/check-updates", { method: "POST" });
}

export function fetchOverviewHealth(signal?: AbortSignal) {
  return requestJson<OverviewHealthPayload>("/overview/health", { signal }).then((payload) => OverviewHealthPayloadSchema.parse(payload));
}

export function refreshOverviewHealth() {
  return requestJson<OverviewHealthPayload>("/overview/health/refresh", { method: "POST" });
}

export function fetchOverviewTasks(signal?: AbortSignal) {
  return requestJson<OverviewTasksPayload>("/overview/tasks", { signal }).then((payload) => OverviewTasksPayloadSchema.parse(payload));
}

export function refreshOverviewTasks() {
  return requestJson<OverviewTasksPayload & ApiNotice>("/overview/tasks", { method: "POST" });
}

export function exportOverviewTasks() {
  return requestJson<ApiNotice>("/overview/tasks/export", { method: "POST" });
}

export function fetchOverviewRisks(signal?: AbortSignal) {
  return requestJson<OverviewRisksPayload>("/overview/risks", { signal }).then((payload) => OverviewRisksPayloadSchema.parse(payload));
}

export function scanOverviewRisks() {
  return requestJson<OverviewRisksPayload & ApiNotice>("/overview/risks/scan", { method: "POST" });
}

export function exportOverviewRisks() {
  return requestJson<ApiNotice>("/overview/risks/export", { method: "POST" });
}
