import type { CreateRemoteTaskRequest, TerminalSnippetRecord } from "@stackpilot/contracts";

type CatalogSnippet = Omit<TerminalSnippetRecord, "favorite" | "lastUsedAt"> & {
  task: Omit<CreateRemoteTaskRequest, "idempotencyKey"> | null;
};

const terminalSnippetCatalog: readonly CatalogSnippet[] = [
  {
    id: "system-resource-summary", version: 1, title: "系统资源概览", command: "df -h && uptime",
    category: "资源", risk: "read", description: "通过 Agent 采集磁盘、负载、内存、运行时间和主机信息。",
    executable: true, requiredCapability: "system.summary.read",
    task: { type: "system.summary.read", parameters: { includeLoad: true }, expiresInSeconds: 120 },
  },
  {
    id: "nginx-service-status", version: 1, title: "查看 Nginx 状态", command: "systemctl status nginx --no-pager",
    category: "服务", risk: "read", description: "通过受控服务探针读取 Nginx 当前状态，不执行任意 Shell。",
    executable: true, requiredCapability: "service.status.read",
    task: { type: "service.status.read", parameters: { serviceName: "nginx" }, expiresInSeconds: 60 },
  },
  {
    id: "sshd-service-status", version: 1, title: "查看 SSH 服务状态", command: "systemctl status sshd --no-pager",
    category: "服务", risk: "read", description: "通过受控服务探针读取 SSH 服务状态。",
    executable: true, requiredCapability: "service.status.read",
    task: { type: "service.status.read", parameters: { serviceName: "sshd" }, expiresInSeconds: 60 },
  },
  {
    id: "nginx-error-log", version: 1, title: "最近错误日志", command: "tail -n 100 /var/log/nginx/error.log",
    category: "日志", risk: "read", description: "Agent 尚未声明受控日志读取能力，当前仅允许检查与复制。",
    executable: false, requiredCapability: null, task: null,
  },
  {
    id: "restart-worker", version: 1, title: "重启 Worker", command: "systemctl restart worker.service",
    category: "服务", risk: "change", description: "变更类命令尚未接入专用 Agent 能力，当前禁止执行。",
    executable: false, requiredCapability: null, task: null,
  },
  {
    id: "clear-temporary-cache", version: 1, title: "清理临时缓存", command: "rm -rf /tmp/stackpilot-cache/*",
    category: "文件", risk: "danger", description: "危险命令不会下发到 Agent，仅保留为不可执行的检查项。",
    executable: false, requiredCapability: null, task: null,
  },
];

export { terminalSnippetCatalog };
export type { CatalogSnippet };
