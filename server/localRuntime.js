import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

export const localNodeId = "node-local";

const execFileAsync = promisify(execFile);
const probeTimeoutMs = 900;
const defaultWebPort = 4873;
const defaultBackupDirs = ["backups", "backup", "artifacts/backups", "output/backups"];

async function runCommand(command, args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options.cwd,
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

function formatDateTime(value) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function splitPathList(value) {
  return value.split(/[;:]/).map((item) => item.trim()).filter(Boolean);
}

function backupRoots(repoRoot) {
  const configured = process.env.STACKPILOT_BACKUP_DIRS;
  const candidates = configured ? splitPathList(configured) : defaultBackupDirs;
  return candidates.map((item) => resolve(repoRoot, item));
}

async function latestEntry(root, depth = 0) {
  let current = null;
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries.slice(0, 300)) {
    if (entry.name === ".DS_Store") continue;
    const fullPath = join(root, entry.name);
    const info = await stat(fullPath);
    const next = {
      path: fullPath,
      name: entry.name,
      mtimeMs: info.mtimeMs,
      isDirectory: entry.isDirectory(),
    };
    if (!current || next.mtimeMs > current.mtimeMs) current = next;
    if (entry.isDirectory() && depth < 2) {
      const child = await latestEntry(fullPath, depth + 1).catch(() => null);
      if (child && (!current || child.mtimeMs > current.mtimeMs)) current = child;
    }
  }

  return current;
}

async function collectBackupStatus(repoRoot) {
  const roots = backupRoots(repoRoot);
  const existingRoots = [];
  for (const root of roots) {
    const info = await stat(root).catch(() => null);
    if (info?.isDirectory()) existingRoots.push(root);
  }

  if (existingRoots.length === 0) {
    return {
      label: "未发现备份目录",
      status: "警告",
      detail: "设置 STACKPILOT_BACKUP_DIRS 后会扫描最近备份",
    };
  }

  const entries = await Promise.all(existingRoots.map((root) => latestEntry(root).catch(() => null)));
  const latest = entries.filter(Boolean).sort((left, right) => right.mtimeMs - left.mtimeMs)[0];
  if (!latest) {
    return {
      label: "未发现备份文件",
      status: "警告",
      detail: existingRoots.map((root) => basename(root)).join(" / "),
    };
  }

  const ageHours = (Date.now() - latest.mtimeMs) / 3600000;
  return {
    label: formatDateTime(latest.mtimeMs),
    status: ageHours <= 48 ? "健康" : "警告",
    detail: latest.name,
  };
}

async function probeHttp(url, okStatus = (status) => status >= 200 && status < 500) {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), probeTimeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const latency = Math.max(1, Math.round(performance.now() - startedAt));
    return {
      ok: okStatus(response.status),
      latency,
      statusCode: response.status,
      detail: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      latency: null,
      statusCode: null,
      detail: error instanceof Error ? error.message : "探测失败",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function processForPort(port) {
  const result = await runCommand("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-F", "pc"], { timeout: 1600 });
  if (!result.ok || !result.stdout) return null;

  const record = {};
  for (const line of result.stdout.split(/\r?\n/)) {
    if (line.startsWith("p")) record.pid = Number(line.slice(1));
    if (line.startsWith("c")) record.command = line.slice(1);
  }
  return record.pid ? record : null;
}

function serviceStatus(probe, processInfo) {
  if (probe.ok && processInfo) return "健康";
  if (probe.ok || processInfo) return "警告";
  return "离线";
}

function serviceDetail(probe, processInfo) {
  const parts = [probe.detail];
  if (probe.latency !== null) parts.push(`${probe.latency}ms`);
  parts.push(processInfo ? `${processInfo.command || "unknown"} PID ${processInfo.pid}` : "未监听");
  return parts.join(" · ");
}

export async function collectLocalRuntime({ host, port, repoRoot }) {
  const webPort = Number(process.env.STACKPILOT_WEB_PORT ?? process.env.WEB_PORT ?? defaultWebPort);
  const apiUrl = `http://${host}:${port}/healthz`;
  const webUrl = `http://127.0.0.1:${webPort}/`;
  const [apiProbe, webProbe, apiProcess, webProcess, backup] = await Promise.all([
    probeHttp(apiUrl, (status) => status === 200),
    probeHttp(webUrl),
    processForPort(port),
    processForPort(webPort),
    collectBackupStatus(repoRoot),
  ]);

  return {
    latency: {
      label: apiProbe.ok && apiProbe.latency !== null ? `${apiProbe.latency}ms` : "不可达",
      status: apiProbe.ok ? "健康" : "警告",
      detail: apiProbe.detail,
    },
    backup,
    services: [
      {
        id: "stackpilot-api",
        name: "StackPilot API",
        target: `${host}:${port}`,
        status: serviceStatus(apiProbe, apiProcess),
        detail: serviceDetail(apiProbe, apiProcess),
        latencyMs: apiProbe.latency ?? undefined,
        process: apiProcess ? { pid: apiProcess.pid, command: apiProcess.command || "unknown" } : undefined,
      },
      {
        id: "stackpilot-web",
        name: "StackPilot Web",
        target: `127.0.0.1:${webPort}`,
        status: serviceStatus(webProbe, webProcess),
        detail: serviceDetail(webProbe, webProcess),
        latencyMs: webProbe.latency ?? undefined,
        process: webProcess ? { pid: webProcess.pid, command: webProcess.command || "unknown" } : undefined,
      },
    ],
  };
}

export async function runLocalRestart(repoRoot) {
  const restartCommand = process.env.STACKPILOT_NODE_RESTART_COMMAND?.trim();
  if (!restartCommand) {
    return {
      ok: false,
      statusCode: 409,
      message: "未配置 STACKPILOT_NODE_RESTART_COMMAND，未执行节点重启",
    };
  }

  const result = await runCommand("/bin/sh", ["-lc", restartCommand], { cwd: repoRoot, timeout: 15000 });
  return {
    ok: result.ok,
    statusCode: result.ok ? 200 : 500,
    message: result.ok ? "本机节点重启命令已执行" : result.stderr || "本机节点重启命令执行失败",
  };
}
