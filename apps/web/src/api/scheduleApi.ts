import {
  ScheduleMutationResponseSchema,
  SchedulePayloadSchema,
  type CreateScheduleJobRequest,
  type UpdateScheduleJobRequest,
} from "@stackpilot/contracts";
import { requestJson } from "./client";

export type * from "@stackpilot/contracts";

export function fetchScheduleJobs(signal?: AbortSignal) {
  return requestJson<unknown>("/overview/current-user-crontab", { signal }).then((payload) => SchedulePayloadSchema.parse(payload));
}

export function createScheduleJob(payload: Omit<CreateScheduleJobRequest, "idempotencyKey">, proof: string, idempotencyKey: string) {
  return requestJson<unknown>("/overview/current-user-crontab", {
    method: "POST",
    headers: { "X-Reauth-Proof": proof },
    body: JSON.stringify({ ...payload, enabled: payload.enabled ?? true, idempotencyKey }),
  }).then((result) => ScheduleMutationResponseSchema.parse(result));
}

export function updateScheduleJob(id: string, payload: UpdateScheduleJobRequest, proof: string) {
  return requestJson<unknown>(`/overview/current-user-crontab/${id}`, {
    method: "PATCH",
    headers: { "X-Reauth-Proof": proof },
    body: JSON.stringify(payload),
  }).then((result) => ScheduleMutationResponseSchema.parse(result));
}

export function runScheduleJob(id: string, proof: string, idempotencyKey: string) {
  return requestJson<unknown>(`/overview/current-user-crontab/${id}`, {
    method: "PATCH",
    headers: { "X-Reauth-Proof": proof },
    body: JSON.stringify({ action: "run", idempotencyKey }),
  }).then((result) => ScheduleMutationResponseSchema.parse(result));
}

export function deleteScheduleJob(id: string, proof: string) {
  return requestJson<unknown>(`/overview/current-user-crontab/${id}`, {
    method: "DELETE",
    headers: { "X-Reauth-Proof": proof },
  }).then((result) => ScheduleMutationResponseSchema.parse(result));
}
