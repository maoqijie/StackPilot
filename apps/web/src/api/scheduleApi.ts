import type {
  CreateScheduleJobRequest,
  ScheduleJob,
  ScheduleNotice,
  SchedulePayload,
  UpdateScheduleJobRequest,
} from "@stackpilot/contracts";
import { requestJson } from "./client";

export type * from "@stackpilot/contracts";

export function fetchScheduleJobs(signal?: AbortSignal) {
  return requestJson<SchedulePayload>("/overview/current-user-crontab", { signal });
}

export function createScheduleJob(payload: CreateScheduleJobRequest) {
  return requestJson<SchedulePayload & { job: ScheduleJob } & ScheduleNotice>("/overview/current-user-crontab", {
    method: "POST",
    body: JSON.stringify({ ...payload, enabled: payload.enabled ?? true }),
  });
}

export function updateScheduleJob(id: string, payload: UpdateScheduleJobRequest) {
  return requestJson<SchedulePayload & { job: ScheduleJob } & ScheduleNotice>(`/overview/current-user-crontab/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function runScheduleJob(id: string) {
  return requestJson<SchedulePayload & { job: ScheduleJob; output?: string } & ScheduleNotice>(`/overview/current-user-crontab/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "run" }),
  });
}

export function deleteScheduleJob(id: string) {
  return requestJson<SchedulePayload & { job: ScheduleJob } & ScheduleNotice>(`/overview/current-user-crontab/${id}`, {
    method: "DELETE",
  });
}
