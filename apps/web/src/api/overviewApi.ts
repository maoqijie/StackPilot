import type {
  ApiNotice,
  OverviewHealthPayload,
  OverviewRisksPayload,
  OverviewSummaryPayload,
  OverviewTaskPageData,
  OverviewTaskRecord,
  OverviewTasksPayload,
} from "@stackpilot/contracts";
import { requestJson } from "./client";

export type * from "@stackpilot/contracts";

export function fetchOverview(signal?: AbortSignal) {
  return requestJson<OverviewSummaryPayload>("/overview", { signal });
}

export function refreshOverview() {
  return requestJson<OverviewSummaryPayload>("/overview/refresh", { method: "POST" });
}

export function checkOverviewUpdates() {
  return requestJson<ApiNotice & { overview: OverviewSummaryPayload }>("/overview/check-updates", { method: "POST" });
}

export function fetchOverviewHealth(signal?: AbortSignal) {
  return requestJson<OverviewHealthPayload>("/overview/health", { signal });
}

export function refreshOverviewHealth() {
  return requestJson<OverviewHealthPayload>("/overview/health/refresh", { method: "POST" });
}

export function fetchOverviewTasks(signal?: AbortSignal) {
  return requestJson<OverviewTasksPayload>("/overview/tasks", { signal });
}

export function refreshOverviewTasks() {
  return requestJson<OverviewTasksPayload & ApiNotice>("/overview/tasks", { method: "POST" });
}

export function runOverviewTask(id: string) {
  return requestJson<{ task: OverviewTaskRecord; tasks: OverviewTaskRecord[]; page: OverviewTaskPageData } & ApiNotice>(`/overview/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "run" }),
  });
}

export function exportOverviewTasks() {
  return requestJson<ApiNotice>("/overview/tasks/export", { method: "POST" });
}

export function fetchOverviewRisks(signal?: AbortSignal) {
  return requestJson<OverviewRisksPayload>("/overview/risks", { signal });
}

export function scanOverviewRisks() {
  return requestJson<OverviewRisksPayload & ApiNotice>("/overview/risks/scan", { method: "POST" });
}

export function exportOverviewRisks() {
  return requestJson<ApiNotice>("/overview/risks/export", { method: "POST" });
}
