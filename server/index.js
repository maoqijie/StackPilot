import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { readFile, statfs } from "node:fs/promises";
import { cpus, freemem, hostname, loadavg, networkInterfaces, platform, release, totalmem, uptime } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { URL, fileURLToPath } from "node:url";
import { collectLocalRuntime, localNodeId, runLocalRestart } from "./localRuntime.js";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);

const nowTime = () => new Date().toLocaleString("zh-CN", { hour12: false });
const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
const percentText = (value) => `${clampPercent(value)}%`;

const sleep = (ms) => new Promise((resolveSleep) => {
  setTimeout(resolveSleep, ms);
});

async function runCommand(command, args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options.cwd ?? repoRoot,
      timeout: options.timeout ?? 2500,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout ?? "").trim(),
      stderr: String(error.stderr ?? error.message ?? "").trim(),
    };
  }
}

function formatDuration(seconds) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
  return `${minutes} 分钟`;
}

function cpuSnapshot() {
  return cpus().map((cpu) => {
    const values = Object.values(cpu.times);
    return {
      idle: cpu.times.idle,
      total: values.reduce((sum, value) => sum + value, 0),
    };
  });
}

function cpuUsageFromSnapshots(before, after) {
  const corePercents = after.map((next, index) => {
    const previous = before[index] ?? next;
    const idle = Math.max(next.idle - previous.idle, 0);
    const total = Math.max(next.total - previous.total, 1);
    return clampPercent((1 - idle / total) * 100);
  });
  const average = corePercents.length
    ? corePercents.reduce((sum, value) => sum + value, 0) / corePercents.length
    : 0;

  return {
    average: clampPercent(average),
    corePercents: corePercents.length > 1 ? corePercents : [clampPercent(average), clampPercent(average)],
  };
}

async function collectCpuUsage() {
  const before = cpuSnapshot();
  await sleep(140);
  return cpuUsageFromSnapshots(before, cpuSnapshot());
}

async function readPackageInfo() {
  const raw = await readFile(join(repoRoot, "package.json"), "utf8");
  const parsed = JSON.parse(raw);
  return {
    name: parsed.name ?? "stackpilot",
    version: parsed.version ?? "0.0.0",
    scripts: parsed.scripts && typeof parsed.scripts === "object" ? parsed.scripts : {},
  };
}

async function detectPackageManager() {
  try {
    await readFile(join(repoRoot, "package-lock.json"));
    return "npm";
  } catch {
    return "未检测到锁文件";
  }
}

function primaryAddress() {
  const interfaces = networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return "127.0.0.1";
}

async function collectGitInfo() {
  const [statusResult, branchResult, commitResult, logResult] = await Promise.all([
    runCommand("git", ["status", "--porcelain=v1", "--branch"]),
    runCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"]),
    runCommand("git", ["rev-parse", "--short", "HEAD"]),
    runCommand("git", ["log", "--date=format-local:%m-%d %H:%M:%S", "--pretty=format:%ad%x1f%an%x1f%s%x1f%h", "-n", "7"]),
  ]);

  const statusLines = statusResult.ok ? statusResult.stdout.split(/\r?\n/).filter(Boolean) : [];
  const branchLine = statusLines.find((line) => line.startsWith("##")) ?? "";
  const changeLines = statusLines.filter((line) => !line.startsWith("##"));
  const counts = changeLines.reduce((accumulator, line) => {
    const code = line.slice(0, 2);
    if (code === "??") accumulator.untracked += 1;
    else if (code.includes("D")) accumulator.deleted += 1;
    else if (code.includes("M")) accumulator.modified += 1;
    else accumulator.other += 1;
    return accumulator;
  }, { modified: 0, untracked: 0, deleted: 0, other: 0 });
  const ahead = Number(branchLine.match(/ahead (\d+)/)?.[1] ?? 0);
  const behind = Number(branchLine.match(/behind (\d+)/)?.[1] ?? 0);
  const branch = branchResult.ok ? branchResult.stdout : branchLine.replace(/^##\s*/, "").split(/[. ]/)[0] || "unknown";
  const commit = commitResult.ok ? commitResult.stdout : "unknown";
  const updateLabel = changeLines.length
    ? `${changeLines.length} 个工作区变更`
    : behind
      ? `落后 ${behind} 个提交`
      : ahead
        ? `领先 ${ahead} 个提交`
        : "已同步";

  const logs = logResult.ok
    ? logResult.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
      const [time, author, subject, hash] = line.split("\x1f");
      return { time, author, subject, hash };
    }).filter((item) => item.time && item.hash)
    : [];

  return {
    available: statusResult.ok || branchResult.ok,
    branch,
    commit,
    ahead,
    behind,
    changedFiles: changeLines,
    counts,
    updateLabel,
    logs,
  };
}

async function collectDiskUsage() {
  try {
    const disk = await statfs(repoRoot);
    const total = disk.blocks * disk.bsize;
    const free = disk.bavail * disk.bsize;
    const used = Math.max(total - free, 0);
    return {
      total,
      free,
      used,
      percent: total > 0 ? clampPercent((used / total) * 100) : 0,
    };
  } catch {
    return { total: 0, free: 0, used: 0, percent: 0 };
  }
}

function spark(values) {
  const normalized = values.map(clampPercent);
  if (normalized.length >= 2) return normalized;
  const value = normalized[0] ?? 0;
  return [value, value];
}

function usageStatus(cpuPercent, memoryPercent, diskPercent, gitInfo, runtime) {
  const unhealthyService = runtime.services.some((service) => service.status !== "健康");
  if (
    cpuPercent >= 85
    || memoryPercent >= 88
    || diskPercent >= 90
    || gitInfo.behind > 0
    || runtime.latency.status !== "健康"
    || runtime.backup.status !== "健康"
    || unhealthyService
  ) return "警告";
  return "健康";
}

function buildWorkbenchTasks(packageInfo, gitInfo, processUptimeSeconds) {
  const tasks = [{
    id: "task-api-live",
    type: "服务",
    title: "StackPilot API 已响应工作台实时采集",
    target: `http://${host}:${port}`,
    status: "成功",
    priority: "中",
    operator: "node",
    queuedAt: "本次请求",
    duration: formatDuration(processUptimeSeconds),
    logs: ["HTTP 服务在线", `仓库路径：${repoRoot}`],
  }];

  if (gitInfo.changedFiles.length > 0) {
    tasks.push({
      id: "task-git-worktree",
      type: "版本控制",
      title: `处理 ${gitInfo.changedFiles.length} 个 Git 工作区变更`,
      target: gitInfo.branch,
      status: "等待",
      priority: gitInfo.changedFiles.length >= 5 ? "高" : "中",
      operator: "git",
      queuedAt: "实时扫描",
      duration: "待处理",
      logs: gitInfo.changedFiles.slice(0, 6),
    });
  }

  Object.keys(packageInfo.scripts).slice(0, 6).forEach((name) => {
    tasks.push({
      id: `task-script-${name}`,
      type: "脚本",
      title: `npm run ${name}`,
      target: "package.json",
      status: name === "api" ? "运行中" : "等待",
      priority: name === "build" || name === "lint" ? "中" : "低",
      operator: "npm",
      queuedAt: "package.json",
      duration: String(packageInfo.scripts[name]),
      logs: [String(packageInfo.scripts[name])],
    });
  });

  return tasks;
}

function buildWorkbenchRisks({ cpuPercent, memoryPercent, diskPercent, gitInfo, packageInfo, runtime }) {
  const risks = [];
  const pushRisk = (id, title, level, target, impact, suggestion) => {
    risks.push({
      id,
      title,
      level,
      status: "待处理",
      target,
      owner: "本机工作台",
      impact,
      detected: "实时采样",
      suggestion,
      traceId: `${id}-${Date.now().toString(36)}`,
    });
  };

  if (cpuPercent >= 85) {
    pushRisk("risk-cpu", "CPU 使用率过高", "高危", hostname(), `当前采样 ${percentText(cpuPercent)}`, "检查高占用进程，必要时暂停耗时任务。");
  } else if (cpuPercent >= 70) {
    pushRisk("risk-cpu", "CPU 使用率偏高", "中危", hostname(), `当前采样 ${percentText(cpuPercent)}`, "观察构建、测试或开发服务器是否持续占用 CPU。");
  }

  if (memoryPercent >= 88) {
    pushRisk("risk-memory", "内存压力过高", "高危", hostname(), `当前采样 ${percentText(memoryPercent)}`, "关闭不必要进程或扩大可用内存后再运行重任务。");
  } else if (memoryPercent >= 76) {
    pushRisk("risk-memory", "内存压力偏高", "中危", hostname(), `当前采样 ${percentText(memoryPercent)}`, "运行构建或浏览器验收前先确认可用内存。");
  }

  if (diskPercent >= 90) {
    pushRisk("risk-disk", "磁盘空间不足", "高危", repoRoot, `当前采样 ${percentText(diskPercent)}`, "清理构建产物、缓存或迁移大文件后再继续部署。");
  } else if (diskPercent >= 80) {
    pushRisk("risk-disk", "磁盘使用率偏高", "中危", repoRoot, `当前采样 ${percentText(diskPercent)}`, "关注依赖缓存、截图和打包产物占用。");
  }

  if (gitInfo.changedFiles.length > 0) {
    pushRisk(
      "risk-git-dirty",
      "Git 工作区存在未提交变更",
      gitInfo.changedFiles.length >= 5 ? "中危" : "低危",
      `${gitInfo.branch} @ ${gitInfo.commit}`,
      `${gitInfo.changedFiles.length} 个变更会影响交付边界`,
      "完成当前页面后运行 lint/build，再按需提交保存进度。",
    );
  }

  if (gitInfo.behind > 0) {
    pushRisk("risk-git-behind", "当前分支落后上游", "中危", gitInfo.branch, `落后 ${gitInfo.behind} 个提交`, "合并远端更新前先确认本地变更和验证结果。");
  }

  if (runtime.latency.status !== "健康") {
    pushRisk("risk-api-latency", "本机 API 健康探测失败", "中危", runtime.latency.detail, runtime.latency.label, "检查 StackPilot API 监听端口和 /healthz 响应。");
  }

  if (runtime.backup.status !== "健康") {
    pushRisk("risk-backup", "未发现近期真实备份", "中危", runtime.backup.detail, runtime.backup.label, "配置 STACKPILOT_BACKUP_DIRS 或补齐备份落盘任务。");
  }

  runtime.services
    .filter((service) => service.status !== "健康")
    .forEach((service) => {
      pushRisk(`risk-service-${service.id}`, `${service.name} 服务异常`, "中危", service.target, service.detail, "检查监听进程、端口和 HTTP 健康探测。");
    });

  if (!packageInfo.scripts.build || !packageInfo.scripts.lint) {
    pushRisk("risk-scripts", "缺少标准验证脚本", "低危", "package.json", "交付前验证路径不完整", "补齐 lint/build 脚本，保证工作台页面可重复验证。");
  }

  return risks;
}

const state = {
  lastRefresh: "2025-05-22 02:15",
  scannedAt: "2025-05-22 10:24:31",
  resolvedRiskIds: new Set(),
  deferredRiskIds: new Set(),
  updateCheck: {
    lastCheckedAt: "2025-05-22 02:15",
    availableUpdates: 2,
    message: "2 个组件可更新",
  },
};

async function overviewPayload() {
  const collectedAt = nowTime();
  const [packageInfo, packageManager, gitInfo, disk, cpu, runtime] = await Promise.all([
    readPackageInfo(),
    detectPackageManager(),
    collectGitInfo(),
    collectDiskUsage(),
    collectCpuUsage(),
    collectLocalRuntime({ host, port, repoRoot }),
  ]);
  const totalMemory = totalmem();
  const freeMemory = freemem();
  const memoryPercent = totalMemory > 0 ? clampPercent(((totalMemory - freeMemory) / totalMemory) * 100) : 0;
  const cpuPercent = cpu.average;
  const loadPercent = clampPercent((loadavg()[0] / Math.max(cpus().length, 1)) * 100);
  const platformLabel = `${platform()} ${release()}`;
  const health = usageStatus(cpuPercent, memoryPercent, disk.percent, gitInfo, runtime);
  const tasks = buildWorkbenchTasks(packageInfo, gitInfo, process.uptime());
  const risks = buildWorkbenchRisks({ cpuPercent, memoryPercent, diskPercent: disk.percent, gitInfo, packageInfo, runtime })
    .map((risk) => {
      if (state.resolvedRiskIds.has(risk.id)) return { ...risk, status: "已处理" };
      if (state.deferredRiskIds.has(risk.id)) return { ...risk, status: "已暂缓" };
      return risk;
    });
  const openRisks = risks.filter((risk) => risk.status === "待处理");
  const queuedTasks = tasks.filter((task) => ["运行中", "等待"].includes(task.status));
  const failedTasks = tasks.filter((task) => task.status === "失败");
  const node = {
    id: localNodeId,
    name: hostname(),
    ip: primaryAddress(),
    env: "本机",
    status: health,
    latency: runtime.latency.label,
    latencyStatus: runtime.latency.status,
    cpu: percentText(cpuPercent),
    memory: percentText(memoryPercent),
    disk: percentText(disk.percent),
    version: `v${packageInfo.version}`,
    uptime: formatDuration(uptime()),
    backup: runtime.backup.label,
    backupStatus: runtime.backup.status,
    update: gitInfo.updateLabel,
    owner: `${packageManager} / ${gitInfo.branch}`,
    services: runtime.services,
  };
  const audits = gitInfo.logs.map((item) => ([
    item.time,
    "git",
    item.author,
    item.subject,
    gitInfo.branch,
    "成功",
    item.hash,
  ]));
  if (audits.length === 0) {
    audits.push([collectedAt, "git", "系统", "未读取到提交记录", gitInfo.branch, "失败", gitInfo.commit]);
  }
  const cpuLine = spark([...cpu.corePercents, cpuPercent, loadPercent]);
  const memoryLine = spark([memoryPercent - 8, memoryPercent - 3, memoryPercent, memoryPercent + 2, memoryPercent - 1]);
  const diskLine = spark([disk.percent - 2, disk.percent - 1, disk.percent, disk.percent + 1]);

  return {
    lastRefresh: collectedAt,
    cluster: {
      current: node.name,
      health,
      latency: node.latency,
      version: node.version,
      uptime: node.uptime,
      lastBackup: node.backup,
      pendingUpdates: gitInfo.changedFiles.length + gitInfo.behind,
    },
    metrics: [
      { label: "CPU 使用率", value: String(cpuPercent), suffix: "%", delta: `1 分钟负载 ${percentText(loadPercent)}`, icon: "server", tone: cpuPercent >= 85 ? "red" : cpuPercent >= 70 ? "orange" : "blue", line: cpuLine },
      { label: "内存使用率", value: String(memoryPercent), suffix: "%", delta: `${Math.round(freeMemory / 1024 / 1024 / 1024)} GB 可用`, icon: "database", tone: memoryPercent >= 88 ? "red" : memoryPercent >= 76 ? "orange" : "blue", line: memoryLine },
      { label: "磁盘使用率", value: String(disk.percent), suffix: "%", delta: `${Math.round(disk.free / 1024 / 1024 / 1024)} GB 可用`, icon: "globe", tone: disk.percent >= 90 ? "red" : disk.percent >= 80 ? "orange" : "blue", line: diskLine },
      { label: "待处理任务", value: String(queuedTasks.length), suffix: "", delta: `${Object.keys(packageInfo.scripts).length} 个 npm 脚本`, icon: "calendar", tone: "gray", line: spark([queuedTasks.length * 10, Object.keys(packageInfo.scripts).length * 10, 20, 35]) },
      { label: "风险项", value: String(openRisks.length), suffix: "", delta: `${openRisks.filter((risk) => risk.level === "高危").length} 高危`, icon: "shield", tone: openRisks.length ? "orange" : "blue", line: spark([openRisks.length * 20, risks.length * 15, gitInfo.changedFiles.length * 8]) },
      { label: "Git 变更", value: String(gitInfo.changedFiles.length), suffix: "", delta: gitInfo.updateLabel, icon: "bell", tone: gitInfo.changedFiles.length ? "red" : "blue", line: spark([gitInfo.counts.modified * 20, gitInfo.counts.untracked * 20, gitInfo.counts.deleted * 20, gitInfo.changedFiles.length * 10]) },
    ],
    nodes: [node],
    tasks,
    audits,
    risks,
    resources: {
      当前采样: [
        { label: "CPU 使用率", value: percentText(cpuPercent), delta: `${cpus().length} 核心`, values: cpuLine },
        { label: "内存使用率", value: percentText(memoryPercent), delta: `${Math.round(totalMemory / 1024 / 1024 / 1024)} GB 总量`, values: memoryLine },
        { label: "磁盘使用率", value: percentText(disk.percent), delta: "仓库所在卷", values: diskLine },
        { label: "系统负载", value: loadavg()[0].toFixed(2), delta: platformLabel, values: spark(loadavg().map((value) => (value / Math.max(cpus().length, 1)) * 100)) },
      ],
    },
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

async function readJson(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  if (!raw.trim()) return {};

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("请求体必须是合法 JSON");
    error.statusCode = 400;
    throw error;
  }
}

function sendRecordOr404(response, key, record, message = "记录不存在") {
  if (!record) {
    sendError(response, 404, message);
    return false;
  }
  sendJson(response, 200, record);
  return true;
}

async function handleOverviewRoute(request, response, parts) {
  if (request.method === "GET" && parts.length === 2) {
    sendJson(response, 200, await overviewPayload());
    return;
  }

  if (request.method === "POST" && parts[2] === "refresh" && parts.length === 3) {
    state.lastRefresh = nowTime();
    sendJson(response, 200, await overviewPayload());
    return;
  }

  if (request.method === "POST" && parts[2] === "cluster" && parts.length === 3) {
    await readJson(request);
    sendJson(response, 200, await overviewPayload());
    return;
  }

  if (request.method === "POST" && parts[2] === "check-updates" && parts.length === 3) {
    const overview = await overviewPayload();
    state.updateCheck = {
      lastCheckedAt: nowTime(),
      availableUpdates: overview.cluster.pendingUpdates,
      message: "检查完成",
    };
    sendJson(response, 200, {
      message: `检查完成：${state.updateCheck.availableUpdates} 个待处理项`,
      tone: state.updateCheck.availableUpdates ? "warning" : "success",
      overview,
    });
    return;
  }

  sendError(response, 404, "总览接口不存在");
}

async function handleHealthRoute(request, response, parts) {
  if (request.method === "GET" && parts.length === 3) {
    const overview = await overviewPayload();
    sendJson(response, 200, { nodes: overview.nodes, lastRefresh: overview.lastRefresh });
    return;
  }

  if (request.method === "POST" && parts[3] === "refresh" && parts.length === 4) {
    const overview = await overviewPayload();
    sendJson(response, 200, { nodes: overview.nodes, lastRefresh: overview.lastRefresh });
    return;
  }

  if (request.method === "POST" && parts[3] === "nodes" && parts.length === 4) {
    await readJson(request);
    const overview = await overviewPayload();
    sendJson(response, 200, {
      nodes: overview.nodes,
      lastRefresh: overview.lastRefresh,
      message: "已刷新真实本机节点；远程 Agent 注册尚未启用",
      tone: "info",
    });
    return;
  }

  if (request.method === "PATCH" && parts[3] === "nodes" && parts.length === 5) {
    await readJson(request);
    if (parts[4] !== localNodeId) {
      sendError(response, 404, "节点不存在");
      return;
    }
    const overview = await overviewPayload();
    const node = overview.nodes.find((item) => item.id === localNodeId);
    sendRecordOr404(response, "node", node ? { node, message: "已重新采集真实本机节点状态", tone: "info" } : null);
    return;
  }

  if (request.method === "POST" && parts[3] === "nodes" && parts[5] === "restart" && parts.length === 6) {
    if (parts[4] !== localNodeId) {
      sendError(response, 404, "节点不存在");
      return;
    }
    const result = await runLocalRestart(repoRoot);
    if (!result.ok) {
      sendError(response, result.statusCode, result.message);
      return;
    }
    sendJson(response, 200, { message: result.message, tone: "success" });
    return;
  }

  sendError(response, 404, "集群状态接口不存在");
}

async function handleTasksRoute(request, response, parts) {
  if (request.method === "GET" && parts.length === 3) {
    const overview = await overviewPayload();
    sendJson(response, 200, { tasks: overview.tasks });
    return;
  }

  if (request.method === "POST" && parts.length === 3) {
    await readJson(request);
    sendError(response, 501, "真实任务创建尚未配置任务执行器");
    return;
  }

  if (request.method === "POST" && parts[3] === "export" && parts.length === 4) {
    sendJson(response, 200, { message: "已复制当前任务流摘要", tone: "info" });
    return;
  }

  if (request.method === "PATCH" && parts.length === 4) {
    await readJson(request);
    sendError(response, 501, "真实任务状态修改尚未配置任务执行器");
    return;
  }

  sendError(response, 404, "任务流接口不存在");
}

async function handleRisksRoute(request, response, parts) {
  if (request.method === "GET" && parts.length === 3) {
    const overview = await overviewPayload();
    sendJson(response, 200, { risks: overview.risks, scannedAt: overview.lastRefresh });
    return;
  }

  if (request.method === "POST" && parts.length === 3) {
    await readJson(request);
    sendError(response, 501, "真实风险创建尚未配置风险扫描器写入接口");
    return;
  }

  if (request.method === "POST" && parts[3] === "scan" && parts.length === 4) {
    state.scannedAt = nowTime();
    const overview = await overviewPayload();
    sendJson(response, 200, { risks: overview.risks, scannedAt: overview.lastRefresh, message: "已触发风险重新扫描", tone: "info" });
    return;
  }

  if (request.method === "POST" && parts[3] === "export" && parts.length === 4) {
    sendJson(response, 200, { message: "风险报告已导出", tone: "info" });
    return;
  }

  if (request.method === "PATCH" && parts.length === 4) {
    const patch = await readJson(request);
    if (patch.status === "已处理") {
      state.resolvedRiskIds.add(parts[3]);
      state.deferredRiskIds.delete(parts[3]);
    }
    if (patch.status === "已暂缓") {
      state.deferredRiskIds.add(parts[3]);
      state.resolvedRiskIds.delete(parts[3]);
    }
    const overview = await overviewPayload();
    const risk = overview.risks.find((item) => item.id === parts[3]);
    sendRecordOr404(response, "risk", risk ? { risk, message: `${risk.title} 已更新` } : null);
    return;
  }

  sendError(response, 404, "风险中心接口不存在");
}

async function handleRequest(request, response) {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);
  const parts = url.pathname.split("/").filter(Boolean);

  if (url.pathname === "/healthz") {
    sendJson(response, 200, { ok: true, service: "stackpilot-api", time: nowTime() });
    return;
  }

  if (parts[0] !== "api" || parts[1] !== "overview") {
    sendError(response, 404, "接口不存在");
    return;
  }

  if (parts[2] === "health") {
    await handleHealthRoute(request, response, parts);
    return;
  }

  if (parts[2] === "tasks") {
    await handleTasksRoute(request, response, parts);
    return;
  }

  if (parts[2] === "risks") {
    await handleRisksRoute(request, response, parts);
    return;
  }

  await handleOverviewRoute(request, response, parts);
}

const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    sendError(response, error.statusCode ?? 500, error.message || "服务内部错误");
  });
});

server.listen(port, host, () => {
  console.log(`StackPilot API listening on http://${host}:${port}`);
});
