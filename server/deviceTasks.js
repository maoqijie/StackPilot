import { execFile } from "node:child_process";
import { hostname, platform } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function runCommand(command, args, options = {}) {
  const startedAt = performance.now();
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: options.timeout ?? 2500,
      maxBuffer: options.maxBuffer ?? 1024 * 1024,
    });
    return {
      ok: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      elapsedMs: Math.max(1, Math.round(performance.now() - startedAt)),
    };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout ?? "").trim(),
      stderr: String(error.stderr ?? error.message ?? "").trim(),
      elapsedMs: Math.max(1, Math.round(performance.now() - startedAt)),
    };
  }
}

function statusFromRuntime(value) {
  if (value === "健康") return "成功";
  if (value === "警告") return "等待";
  return "失败";
}

function durationText(elapsedMs) {
  return `${Math.max(1, Math.round(elapsedMs))}ms`;
}

function compactLines(lines, fallback) {
  const next = lines.map((line) => line.trim()).filter(Boolean).slice(0, 8);
  return next.length ? next : [fallback];
}

function panelServiceTasks(runtime, collectedAt, { host, port }) {
  return runtime.services.map((service) => {
    const isApi = service.id === "stackpilot-api";
    return {
      id: `task-device-${service.id}`,
      type: "服务",
      title: isApi ? "检查 StackPilot API 服务" : "检查 StackPilot Web 服务",
      target: service.target,
      status: statusFromRuntime(service.status),
      priority: service.status === "健康" ? "低" : "中",
      operator: service.process?.command ?? "未监听",
      queuedAt: collectedAt,
      duration: typeof service.latencyMs === "number" ? `${service.latencyMs}ms` : "未采集",
      source: isApi ? `HTTP GET http://${host}:${port}/healthz + lsof TCP:${port}` : "HTTP GET Web 入口 + lsof TCP",
      actionLabel: "检查",
      collectedAt,
      logs: [
        `${service.name}：${service.detail}`,
        service.process ? `进程：${service.process.command} PID ${service.process.pid}` : "未发现监听进程",
      ],
    };
  });
}

function parseLaunchctlJobs(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("PID"))
    .map((line) => {
      const [pid, status, ...labelParts] = line.split(/\s+/);
      return { pid, status: Number(status), label: labelParts.join(" ") };
    })
    .filter((job) => job.label);
}

function parseCronEntries(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

async function collectSchedulerTask(collectedAt) {
  const currentPlatform = platform();
  const startedAt = performance.now();

  if (currentPlatform === "darwin") {
    const [launchctl, crontab] = await Promise.all([
      runCommand("launchctl", ["list"], { timeout: 3500 }),
      runCommand("crontab", ["-l"], { timeout: 1800 }),
    ]);
    const jobs = launchctl.ok ? parseLaunchctlJobs(launchctl.stdout) : [];
    const cronEntries = crontab.ok ? parseCronEntries(crontab.stdout) : [];
    return {
      id: "task-device-scheduler",
      type: "计划任务",
      title: "采集设备计划任务",
      target: `${jobs.length} 个 launchd / ${cronEntries.length} 个 cron`,
      status: launchctl.ok || crontab.ok ? "成功" : "失败",
      priority: "中",
      operator: "launchctl",
      queuedAt: collectedAt,
      duration: durationText(performance.now() - startedAt),
      source: "launchctl list + crontab -l",
      actionLabel: "检查",
      collectedAt,
      logs: compactLines([
        launchctl.ok ? `launchd 用户任务：${jobs.length} 个` : `launchctl 读取失败：${launchctl.stderr}`,
        crontab.ok ? `当前用户 cron：${cronEntries.length} 条` : "当前用户未配置 crontab 或不可读",
        ...cronEntries.slice(0, 5),
      ], "未采集到计划任务"),
    };
  }

  const [timers, crontab] = await Promise.all([
    runCommand("systemctl", ["list-timers", "--all", "--no-legend", "--no-pager"], { timeout: 3500 }),
    runCommand("crontab", ["-l"], { timeout: 1800 }),
  ]);
  const timerLines = timers.ok ? timers.stdout.split(/\r?\n/).filter(Boolean) : [];
  const cronEntries = crontab.ok ? parseCronEntries(crontab.stdout) : [];
  return {
    id: "task-device-scheduler",
    type: "计划任务",
    title: "采集设备计划任务",
    target: `${timerLines.length} 个 timer / ${cronEntries.length} 个 cron`,
    status: timers.ok || crontab.ok ? "成功" : "失败",
    priority: "中",
    operator: timers.ok ? "systemctl" : "crontab",
    queuedAt: collectedAt,
    duration: durationText(performance.now() - startedAt),
    source: "systemctl list-timers + crontab -l",
    actionLabel: "检查",
    collectedAt,
    logs: compactLines([
      timers.ok ? `systemd timer：${timerLines.length} 个` : `systemctl timer 读取失败：${timers.stderr}`,
      crontab.ok ? `当前用户 cron：${cronEntries.length} 条` : "当前用户未配置 crontab 或不可读",
      ...timerLines.slice(0, 4),
      ...cronEntries.slice(0, 4),
    ], "未采集到计划任务"),
  };
}

async function collectFailureTask(collectedAt) {
  const currentPlatform = platform();
  const startedAt = performance.now();

  if (currentPlatform === "darwin") {
    const launchctl = await runCommand("launchctl", ["list"], { timeout: 3500 });
    const jobs = launchctl.ok ? parseLaunchctlJobs(launchctl.stdout) : [];
    const failed = jobs.filter((job) => Number.isFinite(job.status) && job.status !== 0);
    return {
      id: "task-device-failures",
      type: "异常",
      title: "检查设备异常任务",
      target: hostname(),
      status: launchctl.ok ? failed.length ? "失败" : "成功" : "失败",
      priority: failed.length ? "高" : "低",
      operator: "launchctl",
      queuedAt: collectedAt,
      duration: durationText(performance.now() - startedAt),
      source: "launchctl list status",
      actionLabel: "检查",
      collectedAt,
      logs: compactLines([
        `非 0 状态 launchd 任务：${failed.length} 个`,
        ...failed.slice(0, 7).map((job) => `${job.label} · status ${job.status}`),
      ], launchctl.stderr || "未发现异常任务"),
    };
  }

  const failedUnits = await runCommand("systemctl", ["--failed", "--no-legend", "--no-pager"], { timeout: 3500 });
  const lines = failedUnits.ok ? failedUnits.stdout.split(/\r?\n/).filter(Boolean) : [];
  return {
    id: "task-device-failures",
    type: "异常",
    title: "检查设备失败服务",
    target: hostname(),
    status: failedUnits.ok ? lines.length ? "失败" : "成功" : "失败",
    priority: lines.length ? "高" : "低",
    operator: "systemctl",
    queuedAt: collectedAt,
    duration: durationText(performance.now() - startedAt),
    source: "systemctl --failed",
    actionLabel: "检查",
    collectedAt,
    logs: compactLines([
      `失败 unit：${lines.length} 个`,
      ...lines.slice(0, 7),
    ], failedUnits.stderr || "未发现失败服务"),
  };
}

function parseLsofListeners(stdout) {
  const records = [];
  let current = {};
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith("p")) {
      if (current.pid) records.push(current);
      current = { pid: line.slice(1) };
    } else if (line.startsWith("c")) {
      current.command = line.slice(1);
    } else if (line.startsWith("n")) {
      current.name = line.slice(1);
    }
  }
  if (current.pid) records.push(current);

  const seen = new Set();
  return records.filter((record) => {
    const key = `${record.pid}-${record.command}-${record.name}`;
    if (!record.name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function collectListenersTask(collectedAt) {
  const startedAt = performance.now();
  const listeners = await runCommand("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pcn"], { timeout: 3500, maxBuffer: 2 * 1024 * 1024 });
  const records = listeners.ok ? parseLsofListeners(listeners.stdout) : [];
  return {
    id: "task-device-listeners",
    type: "服务",
    title: "采集设备监听服务",
    target: `${records.length} 个监听端口`,
    status: listeners.ok ? "成功" : "失败",
    priority: records.length ? "中" : "低",
    operator: "lsof",
    queuedAt: collectedAt,
    duration: durationText(performance.now() - startedAt),
    source: "lsof -nP -iTCP -sTCP:LISTEN",
    actionLabel: "检查",
    collectedAt,
    logs: compactLines([
      `监听服务：${records.length} 个`,
      ...records.slice(0, 7).map((record) => `${record.command ?? "unknown"} PID ${record.pid} · ${record.name}`),
    ], listeners.stderr || "未发现监听服务"),
  };
}

export async function collectDeviceTasks({ runtime, collectedAt, host, port }) {
  const [schedulerTask, failureTask, listenersTask] = await Promise.all([
    collectSchedulerTask(collectedAt),
    collectFailureTask(collectedAt),
    collectListenersTask(collectedAt),
  ]);

  return [
    ...panelServiceTasks(runtime, collectedAt, { host, port }),
    listenersTask,
    schedulerTask,
    failureTask,
  ];
}
