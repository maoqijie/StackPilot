export type ScheduleJob = {
  id: string;
  name: string;
  cron: string;
  command: string;
  enabled: boolean;
  nextRun: string;
  lastRun: string;
  result: "成功" | "失败" | "未运行" | "运行中";
};

export type SchedulePayload = {
  jobs: ScheduleJob[];
  scannedAt?: string;
};

export type ScheduleNotice = {
  message: string;
  tone?: "success" | "info" | "warning" | "danger";
};

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    let message = `请求失败 (${response.status})`;
    try {
      const payload = await response.json() as { error?: string; message?: string };
      message = payload.error ?? payload.message ?? message;
    } catch {
      // Keep the HTTP status fallback when the response is not JSON.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function fetchScheduleJobs(signal?: AbortSignal) {
  return requestJson<SchedulePayload>("/overview/current-user-crontab", { signal });
}

export function createScheduleJob(payload: Pick<ScheduleJob, "name" | "cron" | "command">) {
  return requestJson<SchedulePayload & { job: ScheduleJob } & ScheduleNotice>("/overview/current-user-crontab", {
    method: "POST",
    body: JSON.stringify({ ...payload, enabled: true }),
  });
}

export function updateScheduleJob(id: string, payload: Partial<Pick<ScheduleJob, "name" | "cron" | "command" | "enabled">>) {
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
