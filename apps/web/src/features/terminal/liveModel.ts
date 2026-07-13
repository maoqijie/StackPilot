import type { AgentCapability, AgentNodeRecord, CreateRemoteTaskRequest, HostMonitoringRecord, RemoteTaskRecord } from "@stackpilot/contracts";
import type { LiveTerminalHistory, LiveTerminalSession, LiveTerminalSnippet } from "./liveTypes";
import { formatBackendDateTime } from "../../utils/time";

const liveSnippets: LiveTerminalSnippet[] = [
  { id: "summary", title: "系统负载", command: "uptime", category: "资源", description: "采集运行时间、CPU、内存和负载摘要。", lastUsed: "未使用", favorite: true },
  { id: "disk", title: "磁盘占用", command: "df -h", category: "资源", description: "采集 Agent 检测到的全部磁盘卷和容量。", lastUsed: "未使用", favorite: true },
  { id: "nginx", title: "Nginx 状态", command: "systemctl status nginx --no-pager", category: "服务", description: "通过受控服务探针读取 Nginx ActiveState。", lastUsed: "未使用", favorite: false },
  { id: "ssh", title: "SSH 状态", command: "systemctl status sshd --no-pager", category: "服务", description: "通过受控服务探针读取 sshd ActiveState。", lastUsed: "未使用", favorite: false },
];

function terminalKey(command: "df" | "uptime" | "top" | "service") { return `terminal-${command}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`; }
function commandCapability(command: string): AgentCapability | null { const value = command.trim().replace(/\s+/g, " "); if (/^(?:df(?: -h)?|uptime|top)$/i.test(value)) return "system.summary.read"; return /^systemctl status ([A-Za-z0-9_.@:-]+)( --no-pager)?$/i.test(value) ? "service.status.read" : null; }
function supportsCommand(node: AgentNodeRecord | undefined, command: string) { const capability = commandCapability(command); return Boolean(node && capability && node.declaredCapabilities.includes(capability) && node.allowedCapabilities.includes(capability)); }
function commandRequest(command: string): CreateRemoteTaskRequest | null {
  const value = command.trim().replace(/\s+/g, " ");
  if (/^(df)( -h)?$/i.test(value)) return { type: "system.summary.read", parameters: { includeLoad: false }, expiresInSeconds: 60, idempotencyKey: terminalKey("df") };
  if (/^uptime$/i.test(value)) return { type: "system.summary.read", parameters: { includeLoad: true }, expiresInSeconds: 60, idempotencyKey: terminalKey("uptime") };
  if (/^top$/i.test(value)) return { type: "system.summary.read", parameters: { includeLoad: true }, expiresInSeconds: 60, idempotencyKey: terminalKey("top") };
  const service = value.match(/^systemctl status ([A-Za-z0-9_.@:-]+)( --no-pager)?$/i)?.[1];
  return service ? { type: "service.status.read", parameters: { serviceName: service }, expiresInSeconds: 60, idempotencyKey: terminalKey("service") } : null;
}
function taskCommand(task: RemoteTaskRecord) { return task.type === "service.status.read" ? `systemctl status ${String(task.parameters.serviceName)} --no-pager` : task.idempotencyKey.startsWith("terminal-top-") ? "top" : task.parameters.includeLoad ? "uptime" : "df -h"; }
function bytes(value: unknown) { if (typeof value !== "number") return "不可用"; const units = ["B", "KB", "MB", "GB", "TB"]; let amount = value; let unit = 0; while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit += 1; } return `${amount.toFixed(unit ? 1 : 0)} ${units[unit]}`; }
function uptime(value: unknown) { if (typeof value !== "number" || !Number.isFinite(value)) return "不可用"; const days = Math.floor(value / 86_400); const hours = Math.floor(value % 86_400 / 3_600); const minutes = Math.floor(value % 3_600 / 60); return [days ? `${days}天` : "", hours ? `${hours}小时` : "", `${minutes}分钟`].filter(Boolean).join(" "); }
function taskOutput(task: RemoteTaskRecord) {
  if (!task.result) return task.status === "queued" ? "任务已排队，等待 Agent 领取" : ["running", "dispatched"].includes(task.status) ? "Agent 正在执行受控探针" : task.errorCode ?? "任务未返回结果";
  if (["failed", "cancelled", "expired"].includes(task.status)) return [task.errorCode, task.result.message].filter(Boolean).join(": ") || "任务执行失败";
  const data = task.result.data ?? {};
  if (task.type === "service.status.read") return `${String(data.serviceName ?? "service")}: ${String(data.state ?? "unavailable")} (${data.available ? "available" : "unavailable"})${task.result.truncated ? "\n输出已截断" : ""}`;
  const disks = Array.isArray(data.disks) ? data.disks.map((entry) => { const disk = entry as Record<string, unknown>; const total = typeof disk.totalBytes === "number" ? disk.totalBytes : null; const used = typeof disk.usedBytes === "number" ? disk.usedBytes : null; const percent = total && used !== null ? `${Math.round(used / total * 100)}%` : "不可用"; return `${String(disk.mount ?? disk.label ?? "volume")} ${bytes(used)} / ${bytes(total)} · ${percent}`; }) : [];
  return [`hostname: ${String(data.hostname ?? "不可用")}`, `platform: ${String(data.platform ?? "不可用")}`, `primary ip: ${String(data.primaryIp ?? "不可用")}`, `cpu: ${typeof data.cpuPercent === "number" ? `${data.cpuPercent}%` : "不可用"}`, `memory free: ${bytes(data.freeMemoryBytes)} / ${bytes(data.totalMemoryBytes)}`, `uptime: ${uptime(data.uptimeSeconds)}`, ...(Array.isArray(data.loadAverage) ? [`load average: ${data.loadAverage.join(", ")}`] : []), ...disks, ...(task.result.truncated ? ["输出已截断"] : [])].join("\n");
}
function terminalTasks(tasks: RemoteTaskRecord[]) { return tasks.filter((task) => task.idempotencyKey.startsWith("terminal-")).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)); }
function taskStatus(task: RemoteTaskRecord): LiveTerminalHistory["status"] { const unavailable = task.type === "service.status.read" && task.result?.data?.available === false; return task.status === "succeeded" && !unavailable ? "成功" : unavailable || ["failed", "cancelled", "expired"].includes(task.status) ? "失败" : "执行中"; }
function toHistory(task: RemoteTaskRecord, node?: AgentNodeRecord): LiveTerminalHistory { const elapsed = Math.max(0, Date.parse(task.updatedAt) - Date.parse(task.createdAt)); return { id: task.taskId, nodeId: task.targetNodeId, command: taskCommand(task), host: node?.nodeName ?? task.targetNodeId, user: "stackpilot-agent", status: taskStatus(task), duration: `${(elapsed / 1000).toFixed(1)}s`, time: formatBackendDateTime(task.updatedAt), output: taskOutput(task) }; }
function toSessions(nodes: AgentNodeRecord[], hosts: HostMonitoringRecord[], tasks: RemoteTaskRecord[]): LiveTerminalSession[] { return nodes.filter((node) => !node.revokedAt).map((node) => { const host = hosts.find((item) => item.id === node.nodeId); const latest = tasks.find((task) => task.targetNodeId === node.nodeId); return { id: node.nodeId, host: node.nodeName, ip: host?.address ?? "等待 Agent 上报", user: "stackpilot-agent", cwd: "受控任务目录", status: node.status === "online" ? "connected" : "disconnected", latency: node.status === "online" ? "Agent 在线" : "Agent 离线", startedAt: formatBackendDateTime(node.lastSeenAt, "尚未上报"), lastCommand: latest ? taskCommand(latest) : "尚无真实命令", privilege: "user" }; }); }
function freshness(nodes: AgentNodeRecord[], tasks: RemoteTaskRecord[], hostCollectedAt?: string | null) { const values = [hostCollectedAt, ...nodes.map((node) => node.lastSeenAt), ...tasks.map((task) => task.updatedAt)].filter((value): value is string => Boolean(value)).sort(); return formatBackendDateTime(values.at(-1), "等待后端数据"); }

export { commandCapability, commandRequest, freshness, liveSnippets, supportsCommand, terminalTasks, toHistory, toSessions };
