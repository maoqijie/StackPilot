import type {
  CreateScheduleJobRequest,
  ScheduleMutationResponse,
  SchedulePayload,
  UpdateScheduleJobRequest,
} from "@stackpilot/contracts";
import { requestJson } from "./client";

export type * from "@stackpilot/contracts";

export function fetchScheduleJobs(signal?: AbortSignal) {
  return requestJson<SchedulePayload>("/overview/current-user-crontab", { signal });
}

export function createScheduleJob(payload: CreateScheduleJobRequest, proof: string) {
  return requestJson<ScheduleMutationResponse>("/overview/current-user-crontab", {
    method: "POST",
    headers: { "X-Reauth-Proof": proof },
    body: JSON.stringify({ ...payload, enabled: payload.enabled ?? true }),
  });
}

export function updateScheduleJob(id: string, payload: UpdateScheduleJobRequest, proof: string) {
  return requestJson<ScheduleMutationResponse>(`/overview/current-user-crontab/${id}`, {
    method: "PATCH",
    headers: { "X-Reauth-Proof": proof },
    body: JSON.stringify(payload),
  });
}

export function runScheduleJob(id: string, proof: string) {
  return requestJson<ScheduleMutationResponse & { output?: string }>(`/overview/current-user-crontab/${id}`, {
    method: "PATCH",
    headers: { "X-Reauth-Proof": proof },
    body: JSON.stringify({ action: "run" }),
  });
}

export function deleteScheduleJob(id: string, proof: string) {
  return requestJson<ScheduleMutationResponse>(`/overview/current-user-crontab/${id}`, {
    method: "DELETE",
    headers: { "X-Reauth-Proof": proof },
  });
}
