export type OverviewMetricIcon = "server" | "globe" | "database" | "calendar" | "shield" | "bell";

export type OverviewMetricData = {
  label: string;
  value: string;
  suffix: string;
  delta: string;
  icon: OverviewMetricIcon;
  tone: string;
  line: number[];
};

export type OverviewNode = {
  id: string;
  name: string;
  ip: string;
  env: string;
  status: "健康" | "警告" | "维护";
  latency: string;
  latencyStatus: "健康" | "警告";
  cpu: string;
  memory: string;
  disk: string;
  version: string;
  uptime: string;
  backup: string;
  backupStatus: "健康" | "警告";
  update: string;
  owner: string;
  services: OverviewService[];
};

export type OverviewService = {
  id: string;
  name: string;
  target: string;
  status: "健康" | "警告" | "离线";
  detail: string;
};

export type OverviewTaskRecord = {
  id: string;
  type: string;
  title: string;
  target: string;
  status: "成功" | "运行中" | "等待" | "失败" | "已取消";
  priority: "高" | "中" | "低";
  operator: string;
  queuedAt: string;
  duration: string;
  logs: string[];
};

export type OverviewRiskRecord = {
  id: string;
  title: string;
  level: "高危" | "中危" | "低危";
  status: "待处理" | "已处理" | "已暂缓";
  target: string;
  owner: string;
  impact: string;
  detected: string;
  suggestion: string;
  traceId: string;
};

export type OverviewAuditRow = [string, string, string, string, string, "成功" | "失败", string];

export type OverviewResourceRecord = {
  label: string;
  value: string;
  delta: string;
  values: number[];
};

export type OverviewCluster = {
  current: string;
  health: "健康" | "警告" | "维护";
  latency: string;
  version: string;
  uptime: string;
  lastBackup: string;
  pendingUpdates: number;
};

export type OverviewSummaryPayload = {
  cluster: OverviewCluster;
  metrics: OverviewMetricData[];
  nodes: OverviewNode[];
  tasks: OverviewTaskRecord[];
  audits: OverviewAuditRow[];
  risks: OverviewRiskRecord[];
  resources: Record<string, OverviewResourceRecord[]>;
  lastRefresh: string;
};

export type OverviewHealthPayload = {
  nodes: OverviewNode[];
  lastRefresh: string;
};

export type OverviewTasksPayload = {
  tasks: OverviewTaskRecord[];
};

export type OverviewRisksPayload = {
  risks: OverviewRiskRecord[];
  scannedAt?: string;
};

export type ApiNotice = {
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

function jsonBody<T>(body: T): RequestInit {
  return {
    method: "POST",
    body: JSON.stringify(body),
  };
}

export function fetchOverview(signal?: AbortSignal) {
  return requestJson<OverviewSummaryPayload>("/overview", { signal });
}

export function refreshOverview() {
  return requestJson<OverviewSummaryPayload>("/overview/refresh", { method: "POST" });
}

export function switchOverviewCluster(cluster: string) {
  return requestJson<OverviewSummaryPayload>("/overview/cluster", jsonBody({ cluster }));
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

export function createOverviewNode() {
  return requestJson<OverviewHealthPayload & ApiNotice>("/overview/health/nodes", { method: "POST" });
}

export function patchOverviewNode(id: string, patch: Partial<OverviewNode>) {
  return requestJson<{ node: OverviewNode } & ApiNotice>(`/overview/health/nodes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function restartOverviewNode(id: string) {
  return requestJson<ApiNotice>(`/overview/health/nodes/${id}/restart`, { method: "POST" });
}

export function fetchOverviewTasks(signal?: AbortSignal) {
  return requestJson<OverviewTasksPayload>("/overview/tasks", { signal });
}

export function createOverviewTask() {
  return requestJson<OverviewTasksPayload & ApiNotice>("/overview/tasks", { method: "POST" });
}

export function patchOverviewTask(id: string, patch: Partial<OverviewTaskRecord>) {
  return requestJson<{ task: OverviewTaskRecord } & ApiNotice>(`/overview/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function exportOverviewTasks() {
  return requestJson<ApiNotice>("/overview/tasks/export", { method: "POST" });
}

export function fetchOverviewRisks(signal?: AbortSignal) {
  return requestJson<OverviewRisksPayload>("/overview/risks", { signal });
}

export function patchOverviewRisk(id: string, patch: Partial<OverviewRiskRecord>) {
  return requestJson<{ risk: OverviewRiskRecord } & ApiNotice>(`/overview/risks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function scanOverviewRisks() {
  return requestJson<OverviewRisksPayload & ApiNotice>("/overview/risks/scan", { method: "POST" });
}

export function exportOverviewRisks() {
  return requestJson<ApiNotice>("/overview/risks/export", { method: "POST" });
}
