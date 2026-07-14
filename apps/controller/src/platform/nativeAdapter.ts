import { access, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { platform, release, tmpdir } from "node:os";
import { basename, delimiter, isAbsolute, join, resolve } from "node:path";
import type { OverviewNode, OverviewService, OverviewTaskRecord } from "@stackpilot/contracts";
import { collectHostTelemetry, collectPhysicalHostId } from "@stackpilot/host-telemetry";
import type { ControllerConfig } from "../config/environment.js";
import { runFixedCommand } from "./commandRunner.js";
import { hasResourceWarning } from "./resourceHealth.js";
import type { DiskVolume, PlatformAdapter, PlatformSnapshot } from "./types.js";

const nodeId = "node-local";
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
const percent = (value: number) => `${clamp(value)}%`;
const diskPercent = (usedBytes: number, totalBytes: number) => clamp(usedBytes / Math.max(totalBytes, 1) * 100);

function summarizeDiskVolumes(disks: DiskVolume[]) {
  const totalBytes = disks.reduce((sum, disk) => sum + disk.totalBytes, 0);
  const freeBytes = disks.reduce((sum, disk) => sum + disk.freeBytes, 0);
  return { totalBytes, freeBytes, usedBytes: Math.max(0, totalBytes - freeBytes), percent: diskPercent(totalBytes - freeBytes, totalBytes) };
}

type NodeHealthInput = {
  cpuAvailable: boolean; memoryAvailable: boolean; diskAvailable: boolean;
  cpuPercent: number; memoryPercent: number; diskPercent: number; servicesHealthy: boolean;
};

function deriveNodeHealth(input: NodeHealthInput): "健康" | "警告" {
  const resources = {
    cpu: input.cpuAvailable ? input.cpuPercent : null,
    memory: input.memoryAvailable ? input.memoryPercent : null,
    disk: input.diskAvailable ? input.diskPercent : null,
  };
  return hasResourceWarning(resources) || !input.servicesHealthy ? "警告" : "健康";
}

type BackupStatus = { label: string; status: "健康" | "警告"; detail: string };

async function latestEntry(root: string, depth = 0): Promise<{ name: string; mtimeMs: number } | null> {
  let latest: { name: string; mtimeMs: number } | null = null;
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries.slice(0, 300)) {
    if (entry.name === ".DS_Store") continue;
    const fullPath = join(root, entry.name);
    const info = await stat(fullPath);
    const candidate = { name: entry.name, mtimeMs: info.mtimeMs };
    if (!latest || candidate.mtimeMs > latest.mtimeMs) latest = candidate;
    if (entry.isDirectory() && depth < 2) {
      const child = await latestEntry(fullPath, depth + 1).catch(() => null);
      if (child && (!latest || child.mtimeMs > latest.mtimeMs)) latest = child;
    }
  }
  return latest;
}

function backupRoots(config: ControllerConfig, repoRoot: string): string[] {
  const candidates = config.backupDirs
    ? config.backupDirs.split(delimiter).map((item) => item.trim()).filter(Boolean)
    : ["backups", "backup", "artifacts/backups", "output/backups"];
  return candidates.map((item) => isAbsolute(item) ? item : resolve(repoRoot, item));
}

async function collectBackupStatus(config: ControllerConfig, repoRoot: string): Promise<BackupStatus> {
  const roots = backupRoots(config, repoRoot);
  const existing: string[] = [];
  for (const root of roots) {
    const info = await stat(root).catch(() => null);
    if (info?.isDirectory()) existing.push(root);
  }
  if (!existing.length) return { label: "未发现备份目录", status: "警告", detail: "设置 STACKPILOT_BACKUP_DIRS 后会扫描最近备份" };
  const entries = (await Promise.all(existing.map((root) => latestEntry(root).catch(() => null)))).filter((entry): entry is { name: string; mtimeMs: number } => entry !== null).sort((left, right) => right.mtimeMs - left.mtimeMs);
  const latest = entries[0];
  if (!latest) return { label: "未发现备份文件", status: "警告", detail: existing.map((root) => basename(root)).join(" / ") };
  const ageHours = (Date.now() - latest.mtimeMs) / 3_600_000;
  return { label: new Date(latest.mtimeMs).toLocaleString("zh-CN", { hour12: false }), status: ageHours <= 48 ? "健康" : "警告", detail: latest.name };
}
async function probe(url: string): Promise<{ ok: boolean; latency: number | null; detail: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 900);
  const started = performance.now();
  try {
    const response = await fetch(url, { signal: controller.signal });
    return { ok: response.status >= 200 && response.status < 500, latency: Math.max(1, Math.round(performance.now() - started)), detail: `HTTP ${response.status}` };
  } catch {
    return { ok: false, latency: null, detail: "不可达" };
  } finally { clearTimeout(timer); }
}

function service(id: string, name: string, target: string, result: Awaited<ReturnType<typeof probe>>): OverviewService {
  return { id, name, target, status: result.ok ? "健康" : "离线", detail: result.latency ? `${result.detail} · ${result.latency}ms` : result.detail, ...(result.latency === null ? {} : { latencyMs: result.latency }) };
}

export class NativePlatformAdapter implements PlatformAdapter {
  readonly nodeId = nodeId;
  private readonly physicalHostId = collectPhysicalHostId();
  constructor(private readonly config: ControllerConfig, private readonly repoRoot: string) {}

  async collectSnapshot(): Promise<PlatformSnapshot> {
    const [telemetry, physicalHostId] = await Promise.all([collectHostTelemetry(), this.physicalHostId]);
    const cpuCorePercents = telemetry.cpu?.coreUsagePercents ?? [];
    const cpuPercent = telemetry.cpu?.usagePercent ?? 0;
    const memoryTotal = telemetry.memory?.totalBytes ?? 0;
    const memoryAvailable = telemetry.memory?.availableBytes ?? 0;
    const memoryPercent = memoryTotal > 0 ? clamp((memoryTotal - memoryAvailable) / memoryTotal * 100) : 0;
    const disks: DiskVolume[] = telemetry.disks.map((disk) => ({
      ...disk,
      freeBytes: Math.max(0, disk.totalBytes - disk.usedBytes),
      percent: diskPercent(disk.usedBytes, disk.totalBytes),
    }));
    const diskSummary = summarizeDiskVolumes(disks);
    const aggregateDiskPercent = diskSummary.percent;
    const [gitStatus, branchResult, commitResult, logResult, apiProbe, webProbe, packageRaw, backup] = await Promise.all([
      runFixedCommand("git", ["status", "--porcelain=v1", "--branch"], { cwd: this.repoRoot }),
      runFixedCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: this.repoRoot }),
      runFixedCommand("git", ["rev-parse", "--short", "HEAD"], { cwd: this.repoRoot }),
      runFixedCommand("git", ["log", "--pretty=format:%ad%x1f%an%x1f%s%x1f%h", "--date=short", "-n", "7"], { cwd: this.repoRoot }),
      probe(`http://${this.config.host}:${this.config.port}/healthz`),
      probe(`http://127.0.0.1:${this.config.webPort}/`),
      readFile(join(this.repoRoot, "package.json"), "utf8"),
      collectBackupStatus(this.config, this.repoRoot),
    ]);
    const statusLines = gitStatus.ok ? gitStatus.stdout.split(/\r?\n/).filter(Boolean) : [];
    const changedFiles = statusLines.filter((line) => !line.startsWith("##"));
    const branchLine = statusLines.find((line) => line.startsWith("##")) ?? "";
    const behind = Number(branchLine.match(/behind (\d+)/)?.[1] ?? 0);
    const branch = branchResult.ok ? branchResult.stdout : "unknown";
    const commit = commitResult.ok ? commitResult.stdout : "unknown";
    const version = String((JSON.parse(packageRaw) as { version?: string }).version ?? "0.0.0");
    const services = [service("stackpilot-api", "StackPilot API", `${this.config.host}:${this.config.port}`, apiProbe), service("stackpilot-web", "StackPilot Web", `127.0.0.1:${this.config.webPort}`, webProbe)];
    const cpuAvailable = telemetry.cpu !== null;
    const memoryMetricAvailable = telemetry.memory !== null;
    const diskAvailable = disks.length > 0;
    const health = deriveNodeHealth({
      cpuAvailable, memoryAvailable: memoryMetricAvailable, diskAvailable, cpuPercent, memoryPercent,
      diskPercent: aggregateDiskPercent, servicesHealthy: services.every((item) => item.status === "健康"),
    });
    const totalSeconds = telemetry.uptimeSeconds;
    const uptimeLabel = `${Math.floor(totalSeconds / 3600)} 小时 ${Math.floor(totalSeconds % 3600 / 60)} 分钟`;
    const node: OverviewNode = {
      id: nodeId, name: telemetry.hostname, ip: telemetry.primaryIp ?? "暂不可用", env: "本机", status: health,
      source: "controller", collectedAt: telemetry.collectedAt, freshness: "current",
      availability: { cpu: cpuAvailable, memory: memoryMetricAvailable, disk: diskAvailable, latency: true, backup: true, update: true, services: true },
      latency: apiProbe.latency ? `${apiProbe.latency}ms` : "不可达", latencyStatus: apiProbe.ok ? "健康" : "警告",
      cpu: cpuAvailable ? percent(cpuPercent) : "暂不可用", memory: memoryMetricAvailable ? percent(memoryPercent) : "暂不可用", disk: diskAvailable ? percent(aggregateDiskPercent) : "暂不可用", version: `v${version}`,
      uptime: uptimeLabel, backup: backup.label, backupStatus: backup.status,
      update: changedFiles.length ? `${changedFiles.length} 个工作区变更` : behind ? `落后 ${behind} 个提交` : "已同步",
      owner: `npm / ${branch}`, services,
      diskVolumes: disks.map(({ label, mount, totalBytes, usedBytes, percent: volumePercent }) => ({
        label, mount, totalBytes, usedBytes, percent: volumePercent,
      })),
    };
    const auditRows = logResult.ok ? logResult.stdout.split(/\r?\n/).filter(Boolean).map((line): PlatformSnapshot["auditRows"][number] => {
      const [time = "", author = "", subject = "", hash = ""] = line.split("\x1f");
      return [time, "git", author, subject, branch, "成功", hash];
    }) : [];
    const loadAverages = telemetry.loadAverage ?? [];
    return {
      physicalHostId, node, cpuPercent, memoryPercent, diskPercent: aggregateDiskPercent,
      loadPercent: clamp((loadAverages[0] ?? 0) / Math.max(cpuCorePercents.length, 1) * 100),
      changedFiles, branch, commit, behind, version, auditRows, cpuCorePercents, loadAverages,
      totalMemoryBytes: memoryTotal, availableMemoryBytes: memoryAvailable, disks,
      platformLabel: `${platform()} ${release()}`,
    };
  }

  async collectDeviceTasks(snapshot: PlatformSnapshot, collectedAt: string): Promise<OverviewTaskRecord[]> {
    const tasks = snapshot.node.services.map((item): OverviewTaskRecord => ({
      id: `task-device-${item.id}`, type: "服务", title: `检查 ${item.name} 服务`, target: item.target,
      status: item.status === "健康" ? "成功" : item.status === "警告" ? "等待" : "失败", priority: item.status === "健康" ? "低" : "中",
      operator: item.process?.command ?? "未监听", queuedAt: collectedAt, duration: item.latencyMs ? `${item.latencyMs}ms` : "未采集",
      source: "HTTP 健康探测", actionLabel: "检查", collectedAt, logs: [`${item.name}：${item.detail}`],
    }));
    const scheduler = platform() === "darwin"
      ? await runFixedCommand("launchctl", ["list"], { timeoutMs: 3500 })
      : await runFixedCommand("systemctl", ["list-timers", "--all", "--no-legend", "--no-pager"], { timeoutMs: 3500 });
    tasks.push({
      id: "task-device-scheduler", type: "计划任务", title: "采集设备计划任务", target: snapshot.node.name,
      status: scheduler.ok ? "成功" : "失败", priority: scheduler.ok ? "低" : "中", operator: platform() === "darwin" ? "launchctl" : "systemctl",
      queuedAt: collectedAt, duration: `${scheduler.elapsedMs}ms`, source: "平台调度器", actionLabel: "检查", collectedAt,
      logs: [scheduler.ok ? "调度器采集成功" : "调度器不可用"],
    });
    const failures = platform() === "darwin"
      ? await runFixedCommand("launchctl", ["list"], { timeoutMs: 3500 })
      : await runFixedCommand("systemctl", ["--failed", "--no-legend", "--no-pager"], { timeoutMs: 3500 });
    const failureLines = failures.ok ? failures.stdout.split(/\r?\n/).filter(Boolean) : [];
    tasks.push({
      id: "task-device-failures", type: "异常", title: "检查设备失败服务", target: snapshot.node.name,
      status: failures.ok ? failureLines.length ? "失败" : "成功" : "失败", priority: failureLines.length ? "高" : failures.ok ? "低" : "中",
      operator: platform() === "darwin" ? "launchctl" : "systemctl", queuedAt: collectedAt, duration: `${failures.elapsedMs}ms`,
      source: platform() === "darwin" ? "launchctl list status" : "systemctl --failed", actionLabel: "检查", collectedAt,
      logs: failures.ok ? [`失败任务：${failureLines.length} 个`, ...failureLines.slice(0, 7)] : ["失败服务采集不可用"],
    });
    if (platform() !== "win32") {
      const listeners = await runFixedCommand("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"], { timeoutMs: 3500, maxBuffer: 2 * 1024 * 1024 });
      const listenerLines = listeners.ok ? listeners.stdout.split(/\r?\n/).slice(1).filter(Boolean) : [];
      tasks.push({
        id: "task-device-listeners", type: "服务", title: "采集设备监听服务", target: `${listenerLines.length} 个监听记录`,
        status: listeners.ok ? "成功" : "失败", priority: listeners.ok ? "低" : "中", operator: "lsof",
        queuedAt: collectedAt, duration: `${listeners.elapsedMs}ms`, source: "lsof TCP LISTEN", actionLabel: "检查", collectedAt,
        logs: listeners.ok ? [`监听记录：${listenerLines.length} 个`, ...listenerLines.slice(0, 7)] : ["监听服务采集不可用"],
      });
    }
    return tasks;
  }

  async readCrontab(): Promise<string> {
    const result = await runFixedCommand("crontab", ["-l"]);
    if (result.ok) return result.stdout;
    if (`${result.stdout}\n${result.stderr}`.toLowerCase().includes("no crontab")) return "";
    throw new Error("读取 crontab 失败");
  }

  async writeCrontab(content: string): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "stackpilot-cron-"));
    const file = join(dir, "crontab");
    try {
      await writeFile(file, content.trim() ? content : "\n", "utf8");
      const result = await runFixedCommand("crontab", [file], { timeoutMs: 3000 });
      if (!result.ok) throw new Error("写入 crontab 失败");
    } finally { await rm(dir, { recursive: true, force: true }); }
  }

  runScheduledCommand(command: string) {
    return runFixedCommand("/bin/sh", ["-lc", command], { cwd: this.repoRoot, timeoutMs: 120000 });
  }

  async restartNode() {
    const command = this.config.restartCommand?.trim();
    if (!command) return { ok: false, status: 409, message: "未配置 STACKPILOT_NODE_RESTART_COMMAND，未执行节点重启" };
    const result = await runFixedCommand("/bin/sh", ["-lc", command], { cwd: this.repoRoot, timeoutMs: 15000 });
    return { ok: result.ok, status: result.ok ? 200 : 500, message: result.ok ? "本机节点重启命令已执行" : "本机节点重启命令执行失败" };
  }

  async readiness() {
    try {
      await access(join(this.repoRoot, "package.json"));
      return true;
    } catch {
      return false;
    }
  }
}

export { deriveNodeHealth, summarizeDiskVolumes };
