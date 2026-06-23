import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const evidenceTimeoutMs = 1800;

async function runCommand(command, args, options = {}) {
  try {
    const { stdout } = await execFileAsync(command, args, {
      cwd: options.cwd,
      timeout: options.timeout ?? evidenceTimeoutMs,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true, stdout: stdout.trim() };
  } catch (error) {
    return { ok: false, stdout: String(error.stdout ?? "").trim(), error: String(error.message ?? error) };
  }
}

function parseProcessRows(output, fields) {
  return output.split(/\r?\n/).slice(1, 6).map((line) => {
    const match = line.trim().match(/^(\d+)\s+(\S+)\s+(\S+)\s+(.+)$/);
    if (!match) return null;
    const parts = [match[1], match[2], match[3], match[4]];
    return fields.reduce((record, field, index) => ({ ...record, [field]: parts[index] ?? "" }), {});
  }).filter((row) => row?.pid);
}

function processLabel(process) {
  const cpu = process.cpu ? `CPU ${process.cpu}%` : "";
  const memory = process.memory ? `内存 ${process.memory}%` : "";
  return [`PID ${process.pid}`, process.command, cpu, memory].filter(Boolean).join(" · ");
}

async function topCpuProcesses() {
  const result = await runCommand("ps", ["-axo", "pid,pcpu,pmem,comm", "-r"]);
  if (!result.ok) return [];
  return parseProcessRows(result.stdout, ["pid", "cpu", "memory", "command"]).map((process) => ({
    label: "高 CPU 进程",
    value: processLabel(process),
  }));
}

async function topMemoryProcesses() {
  const result = await runCommand("ps", ["-axo", "pid,rss,pmem,comm", "-m"]);
  if (!result.ok) return [];
  return parseProcessRows(result.stdout, ["pid", "rss", "memory", "command"]).map((process) => ({
    label: "高内存进程",
    value: [`PID ${process.pid}`, process.command, `RSS ${process.rss}KB`, `内存 ${process.memory}%`].join(" · "),
  }));
}

async function directorySize(root, name) {
  const fullPath = join(root, name);
  const result = await runCommand("du", ["-sh", fullPath], { timeout: 2500 });
  if (!result.ok || !result.stdout) return null;
  const [size] = result.stdout.split(/\s+/, 1);
  return { label: "目录占用", value: `${name} · ${size}` };
}

async function diskEvidence(repoRoot) {
  const candidates = ["output", "dist", ".playwright-cli", "node_modules", "artifacts"];
  const entries = await Promise.all(candidates.map((name) => directorySize(repoRoot, name).catch(() => null)));
  return entries.filter(Boolean).slice(0, 5);
}

function gitChangeEvidence(gitInfo) {
  const sample = gitInfo.changedFiles.slice(0, 6).map((line) => ({ label: "变更文件", value: line.trim() }));
  if (gitInfo.changedFiles.length > sample.length) {
    sample.push({ label: "变更文件", value: `另有 ${gitInfo.changedFiles.length - sample.length} 个变更未展示` });
  }
  return sample;
}

function serviceEvidence(service) {
  const rows = [
    { label: "健康探测", value: service.detail },
    { label: "目标", value: service.target },
  ];
  if (service.process) rows.push({ label: "监听进程", value: `${service.process.command} PID ${service.process.pid}` });
  return rows;
}

async function backupEvidence(repoRoot) {
  const configured = process.env.STACKPILOT_BACKUP_DIRS;
  const roots = configured ? configured.split(/[;:]/).map((item) => item.trim()).filter(Boolean) : ["backups", "backup", "artifacts/backups", "output/backups"];
  const rows = await Promise.all(roots.slice(0, 5).map(async (root) => {
    const path = root.startsWith("/") ? root : join(repoRoot, root);
    const info = await stat(path).catch(() => null);
    if (!info?.isDirectory()) return { label: "备份目录", value: `${root} · 不存在` };
    const names = await readdir(path).catch(() => []);
    return { label: "备份目录", value: `${root} · ${names.length} 个条目` };
  }));
  return rows;
}

export async function collectRiskEvidence({ gitInfo, repoRoot, runtime }) {
  const [cpuProcesses, memoryProcesses, diskRows, backupRows] = await Promise.all([
    topCpuProcesses(),
    topMemoryProcesses(),
    diskEvidence(repoRoot),
    backupEvidence(repoRoot),
  ]);

  const services = new Map(runtime.services.map((service) => [service.id, serviceEvidence(service)]));

  return {
    cpuProcesses,
    memoryProcesses,
    diskRows,
    gitChanges: gitChangeEvidence(gitInfo),
    backupRows,
    services,
  };
}
