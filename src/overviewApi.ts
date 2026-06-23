export type OverviewMetricIcon = "server" | "globe" | "database" | "calendar" | "shield" | "bell";

export type OverviewTaskStatus = "成功" | "运行中" | "等待" | "失败";

export type OverviewTaskPriority = "高" | "中" | "低";

export type OverviewTaskFilter = {
  id: string;
  label: string;
  statuses: OverviewTaskStatus[];
};

export type OverviewTaskMetric = {
  label: string;
  value: string;
  icon: OverviewMetricIcon;
  tone: string;
};

export type OverviewTaskPageContext = {
  eyebrow: string;
  title: string;
  chips: string[];
};

export type OverviewTaskPageData = {
  title: string;
  subtitle: string;
  searchPlaceholder: string;
  filters: OverviewTaskFilter[];
  metrics: OverviewTaskMetric[];
  context: OverviewTaskPageContext;
  collectedAt: string;
};

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
  latencyMs?: number;
  process?: {
    pid: number;
    command: string;
  };
};

export type OverviewTaskRecord = {
  id: string;
  type: string;
  title: string;
  target: string;
  status: OverviewTaskStatus;
  priority: OverviewTaskPriority;
  operator: string;
  queuedAt: string;
  duration: string;
  source: string;
  actionLabel: string;
  collectedAt: string;
  logs: string[];
};

export type OverviewRiskEvidence = {
  label: string;
  value: string;
};

export type OverviewRiskRecord = {
  id: string;
  title: string;
  level: "高危" | "中危" | "低危";
  status: "待处理";
  target: string;
  owner: string;
  impact: string;
  detected: string;
  suggestion: string;
  evidence?: OverviewRiskEvidence[];
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
  taskPage: OverviewTaskPageData;
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
  page: OverviewTaskPageData;
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
