import { OverviewSummaryPayloadSchema } from "@stackpilot/contracts";
import type { OverviewResourceRecord, OverviewRiskRecord, OverviewSummaryPayload } from "@stackpilot/contracts";
import type { PlatformAdapter, PlatformSnapshot } from "../../platform/types.js";
import type { TaskStateRepository } from "../../repositories/taskStateRepository.js";

const now = () => new Date().toLocaleString("zh-CN", { hour12: false });
const spark = (value: number) => [Math.max(0, value - 7), Math.max(0, value - 2), value, Math.min(100, value + 2)];
const formatGb = (bytes: number) => `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;

export class OverviewService {
  constructor(private readonly platform: PlatformAdapter, private readonly taskState: TaskStateRepository) {}

  async getOverview(): Promise<OverviewSummaryPayload> {
    const collectedAt = now();
    const snapshot = await this.platform.collectSnapshot();
    const rawTasks = await this.platform.collectDeviceTasks(snapshot, collectedAt);
    const tasks = rawTasks.map((task) => ({ ...task, ...this.taskState.get(task.id) }));
    const risks = this.buildRisks(snapshot);
    const taskPage = {
      title: "任务流", subtitle: `整台设备任务信号由后端实时采集，最近采集：${collectedAt}`,
      searchPlaceholder: "搜索设备任务、服务、计划任务、目标或日志",
      filters: [
        { id: "all", label: "全部", statuses: [] },
        { id: "queued", label: "队列中", statuses: ["运行中", "等待"] },
        { id: "success", label: "成功", statuses: ["成功"] },
        { id: "failed", label: "失败", statuses: ["失败"] },
      ],
      metrics: [
        { label: "任务总数", value: String(tasks.length), icon: "calendar", tone: "blue" },
        { label: "队列中", value: String(tasks.filter((task) => ["运行中", "等待"].includes(task.status)).length), icon: "bell", tone: "orange" },
        { label: "失败任务", value: String(tasks.filter((task) => task.status === "失败").length), icon: "shield", tone: "red" },
      ],
      context: { eyebrow: "工作台 / 设备任务", title: "任务流", chips: [`设备采集 ${tasks.length} 条`, `采集时间 ${collectedAt}`] }, collectedAt,
    } as const;
    const resources: Record<string, OverviewResourceRecord[]> = {
      当前采样: [
        { label: "CPU 使用率", value: `${snapshot.cpuPercent}%`, delta: `${snapshot.cpuCorePercents.length} 核心`, values: snapshot.cpuCorePercents.length ? snapshot.cpuCorePercents : spark(snapshot.cpuPercent) },
        { label: "内存使用率", value: `${snapshot.memoryPercent}%`, delta: `${snapshot.totalMemoryGb} GB 总量`, values: spark(snapshot.memoryPercent) },
        { label: "磁盘使用率", value: `${snapshot.diskPercent}%`, delta: `${snapshot.disks.length} 个本地盘`, values: spark(snapshot.diskPercent) },
        { label: "系统负载", value: (snapshot.loadAverages[0] ?? 0).toFixed(2), delta: snapshot.platformLabel, values: snapshot.loadAverages.map((value) => Math.min(100, value * 100 / Math.max(snapshot.cpuCorePercents.length, 1))) },
      ],
    };
    const queuedTasks = tasks.filter((task) => ["运行中", "等待"].includes(task.status));
    const openRisks = risks.filter((risk) => risk.status === "待处理");
    return OverviewSummaryPayloadSchema.parse({
      lastRefresh: collectedAt,
      cluster: { current: snapshot.node.name, health: snapshot.node.status, latency: snapshot.node.latency, version: snapshot.node.version, uptime: snapshot.node.uptime, lastBackup: snapshot.node.backup, pendingUpdates: snapshot.changedFiles.length + snapshot.behind },
      metrics: [
        { label: "CPU 使用率", value: String(snapshot.cpuPercent), suffix: "%", delta: `1 分钟负载 ${snapshot.loadPercent}%`, icon: "server", tone: snapshot.cpuPercent >= 85 ? "red" : snapshot.cpuPercent >= 70 ? "orange" : "blue", line: snapshot.cpuCorePercents.length ? snapshot.cpuCorePercents : spark(snapshot.cpuPercent) },
        { label: "内存使用率", value: String(snapshot.memoryPercent), suffix: "%", delta: `${snapshot.freeMemoryGb} GB 可用`, icon: "database", tone: snapshot.memoryPercent >= 88 ? "red" : snapshot.memoryPercent >= 76 ? "orange" : "blue", line: spark(snapshot.memoryPercent) },
        {
          label: "磁盘使用率", value: String(snapshot.diskPercent), suffix: "%",
          delta: `${snapshot.disks.length} 个盘 · ${snapshot.diskFreeGb} GB 可用`, icon: "globe",
          tone: snapshot.diskPercent >= 90 ? "red" : snapshot.diskPercent >= 80 ? "orange" : "blue",
          line: spark(snapshot.diskPercent),
          details: snapshot.disks.map((disk) => ({
            label: `${disk.label} (${disk.mount})`,
            value: `${disk.percent}%`,
            detail: `已用 ${formatGb(disk.usedBytes)} / ${formatGb(disk.totalBytes)} · 剩余 ${formatGb(disk.freeBytes)}`,
          })),
        },
        { label: "待处理任务", value: String(queuedTasks.length), suffix: "", delta: `${tasks.length} 个设备信号`, icon: "calendar", tone: "gray", line: spark(queuedTasks.length * 10) },
        { label: "风险项", value: String(openRisks.length), suffix: "", delta: `${openRisks.filter((risk) => risk.level === "高危").length} 高危`, icon: "shield", tone: openRisks.length ? "orange" : "blue", line: spark(openRisks.length * 20) },
        { label: "Git 变更", value: String(snapshot.changedFiles.length), suffix: "", delta: snapshot.node.update, icon: "bell", tone: snapshot.changedFiles.length ? "red" : "blue", line: spark(snapshot.changedFiles.length * 10) },
      ],
      nodes: [snapshot.node], tasks, taskPage, audits: snapshot.auditRows.length ? snapshot.auditRows : [[collectedAt, "git", "系统", "未读取到提交记录", snapshot.branch, "失败", snapshot.commit]], risks, resources,
    });
  }

  private buildRisks(snapshot: PlatformSnapshot): OverviewRiskRecord[] {
    const risks: OverviewRiskRecord[] = [];
    const addUsageRisk = (id: string, title: string, value: number, high: number, warning: number, target: string, unit: string) => {
      if (value < warning) return;
      risks.push({ id, title, level: value >= high ? "高危" : "中危", status: "待处理", target, owner: "本机工作台", impact: `当前采样 ${value}${unit}`, detected: "实时采样", suggestion: "定位高占用来源，处理后重新扫描并确认指标恢复。", traceId: `${id}-${Date.now().toString(36)}` });
    };
    addUsageRisk("risk-cpu", "CPU 使用率偏高", snapshot.cpuPercent, 85, 70, snapshot.node.name, "%");
    addUsageRisk("risk-memory", "内存压力偏高", snapshot.memoryPercent, 88, 76, snapshot.node.name, "%");
    addUsageRisk("risk-disk", "磁盘使用率偏高", snapshot.diskPercent, 90, 80, "所有本地盘汇总", "%");
    if (snapshot.changedFiles.length) risks.push({ id: "risk-git-dirty", title: "Git 工作区存在未提交变更", level: snapshot.changedFiles.length >= 5 ? "中危" : "低危", status: "待处理", target: `${snapshot.branch} @ ${snapshot.commit}`, owner: "本机工作台", impact: `${snapshot.changedFiles.length} 个变更会影响交付边界`, detected: "实时采样", suggestion: "提交前检查工作区范围并运行完整验证。", evidence: snapshot.changedFiles.slice(0, 6).map((value) => ({ label: "变更文件", value })), traceId: `risk-git-dirty-${Date.now().toString(36)}` });
    if (snapshot.node.backupStatus !== "健康") risks.push({ id: "risk-backup", title: "未发现近期真实备份", level: "中危", status: "待处理", target: "设置 STACKPILOT_BACKUP_DIRS 后会扫描最近备份", owner: "本机工作台", impact: snapshot.node.backup, detected: "实时采样", suggestion: "配置备份目录并确认近期备份可读。", traceId: `risk-backup-${Date.now().toString(36)}` });
    for (const item of snapshot.node.services.filter((service) => service.status !== "健康")) risks.push({ id: `risk-service-${item.id}`, title: `${item.name} 服务异常`, level: "中危", status: "待处理", target: item.target, owner: "本机工作台", impact: item.detail, detected: "实时采样", suggestion: "检查监听进程与健康接口，恢复后重新扫描。", traceId: `risk-service-${item.id}-${Date.now().toString(36)}` });
    return risks;
  }
}
