import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const blockStart = "# >>> STACKPILOT MANAGED CRON JOBS";
const blockEnd = "# <<< STACKPILOT MANAGED CRON JOBS";
const metaPrefix = "# stackpilot:job=";
const idMarker = "# stackpilot:id=";

function nowTime() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function encodeJob(job) {
  return Buffer.from(JSON.stringify(job), "utf8").toString("base64url");
}

function decodeJob(value) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function assertCronExpression(value) {
  const cron = String(value ?? "").trim();
  const parts = cron.split(/\s+/);
  if (parts.length !== 5 || !parts.every((part) => /^[\dA-Z*/?,-]+$/i.test(part))) {
    const error = new Error("cron 需要是 5 段表达式，例如 0 4 * * *");
    error.statusCode = 400;
    throw error;
  }
  return cron;
}

function assertSafeText(value, label, maxLength = 160) {
  const text = String(value ?? "").trim();
  if (!text) {
    const error = new Error(`${label}不能为空`);
    error.statusCode = 400;
    throw error;
  }
  if (text.includes("\n") || text.includes("\r") || text.length > maxLength) {
    const error = new Error(`${label}不能包含换行且长度不能超过 ${maxLength}`);
    error.statusCode = 400;
    throw error;
  }
  return text;
}

function normalizeJob(job) {
  return {
    id: assertSafeText(job.id, "任务 ID", 80),
    name: assertSafeText(job.name, "任务名"),
    cron: assertCronExpression(job.cron),
    command: assertSafeText(job.command, "命令", 400),
    enabled: Boolean(job.enabled),
    createdAt: String(job.createdAt || nowTime()),
    updatedAt: String(job.updatedAt || nowTime()),
    lastRun: String(job.lastRun || "未运行"),
    result: ["成功", "失败", "未运行", "运行中"].includes(job.result) ? job.result : "未运行",
  };
}

function toClientJob(job) {
  return {
    id: job.id,
    name: job.name,
    cron: job.cron,
    command: job.command,
    enabled: job.enabled,
    nextRun: job.enabled ? "已写入 crontab" : "停用",
    lastRun: job.lastRun,
    result: job.result,
  };
}

async function runCommand(command, args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options.cwd,
      timeout: options.timeout ?? 3000,
      maxBuffer: options.maxBuffer ?? 1024 * 1024,
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    return {
      ok: false,
      code: error.code,
      stdout: String(error.stdout ?? "").trim(),
      stderr: String(error.stderr ?? error.message ?? "").trim(),
    };
  }
}

async function readCrontab() {
  const result = await runCommand("crontab", ["-l"], { timeout: 2500 });
  if (result.ok) return result.stdout;
  const message = `${result.stdout}\n${result.stderr}`.toLowerCase();
  if (message.includes("no crontab") || message.includes("no crontab for")) return "";
  const error = new Error(result.stderr || "读取 crontab 失败");
  error.statusCode = 500;
  throw error;
}

function splitCrontab(raw) {
  const lines = raw.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === blockStart);
  if (startIndex === -1) return { externalLines: lines.filter(Boolean), jobs: [] };
  const endIndex = lines.findIndex((line, index) => index > startIndex && line.trim() === blockEnd);
  if (endIndex === -1) return { externalLines: lines.filter(Boolean), jobs: [] };

  const externalLines = [
    ...lines.slice(0, startIndex),
    ...lines.slice(endIndex + 1),
  ].filter((line, index, array) => line || (array[index - 1] && array[index + 1]));
  const jobs = lines
    .slice(startIndex + 1, endIndex)
    .filter((line) => line.startsWith(metaPrefix))
    .map((line) => decodeJob(line.slice(metaPrefix.length)))
    .filter(Boolean)
    .map(normalizeJob);

  return { externalLines, jobs };
}

function renderCrontab(externalLines, jobs) {
  const lines = externalLines.filter((line) => line.trim() !== blockStart && line.trim() !== blockEnd);
  const normalizedJobs = jobs.map(normalizeJob);
  if (normalizedJobs.length > 0) {
    if (lines.length && lines.at(-1) !== "") lines.push("");
    lines.push(blockStart);
    normalizedJobs.forEach((job) => {
      lines.push(`${metaPrefix}${encodeJob(job)}`);
      if (job.enabled) lines.push(`${job.cron} ${job.command} ${idMarker}${job.id}`);
    });
    lines.push(blockEnd);
  }
  return `${lines.join("\n").trim()}\n`;
}

async function installCrontab(content) {
  const dir = await mkdtemp(join(tmpdir(), "stackpilot-cron-"));
  const filePath = join(dir, "crontab");
  try {
    await writeFile(filePath, content.trim() ? content : "\n", "utf8");
    const result = await runCommand("crontab", [filePath], { timeout: 3000 });
    if (!result.ok) {
      const error = new Error(result.stderr || "写入 crontab 失败");
      error.statusCode = 500;
      throw error;
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function readState() {
  const raw = await readCrontab();
  return splitCrontab(raw);
}

async function writeState(externalLines, jobs) {
  await installCrontab(renderCrontab(externalLines, jobs));
}

function createId() {
  return `sp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function findJob(jobs, id) {
  const job = jobs.find((item) => item.id === id);
  if (!job) {
    const error = new Error("定时任务不存在");
    error.statusCode = 404;
    throw error;
  }
  return job;
}

export async function listCronJobs() {
  const { jobs } = await readState();
  return {
    jobs: jobs.map(toClientJob),
    scannedAt: nowTime(),
  };
}

export async function createCronJob(payload) {
  const { externalLines, jobs } = await readState();
  const timestamp = nowTime();
  const job = normalizeJob({
    id: createId(),
    name: payload.name,
    cron: payload.cron,
    command: payload.command,
    enabled: payload.enabled ?? true,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastRun: "未运行",
    result: "未运行",
  });
  const nextJobs = [job, ...jobs];
  await writeState(externalLines, nextJobs);
  return { job: toClientJob(job), jobs: nextJobs.map(toClientJob) };
}

export async function updateCronJob(id, payload) {
  const { externalLines, jobs } = await readState();
  const current = findJob(jobs, id);
  const nextJob = normalizeJob({
    ...current,
    name: payload.name ?? current.name,
    cron: payload.cron ?? current.cron,
    command: payload.command ?? current.command,
    enabled: payload.enabled ?? current.enabled,
    updatedAt: nowTime(),
  });
  const nextJobs = jobs.map((job) => job.id === id ? nextJob : job);
  await writeState(externalLines, nextJobs);
  return { job: toClientJob(nextJob), jobs: nextJobs.map(toClientJob) };
}

export async function deleteCronJob(id) {
  const { externalLines, jobs } = await readState();
  const current = findJob(jobs, id);
  const nextJobs = jobs.filter((job) => job.id !== id);
  await writeState(externalLines, nextJobs);
  return { job: toClientJob(current), jobs: nextJobs.map(toClientJob) };
}

export async function runCronJobNow(id, repoRoot) {
  const { externalLines, jobs } = await readState();
  const current = findJob(jobs, id);
  const startedAt = nowTime();
  const result = await runCommand("/bin/sh", ["-lc", current.command], {
    cwd: repoRoot,
    timeout: 120000,
    maxBuffer: 1024 * 1024,
  });
  const nextJob = normalizeJob({
    ...current,
    lastRun: startedAt,
    result: result.ok ? "成功" : "失败",
    updatedAt: nowTime(),
  });
  const nextJobs = jobs.map((job) => job.id === id ? nextJob : job);
  await writeState(externalLines, nextJobs);
  return {
    job: toClientJob(nextJob),
    jobs: nextJobs.map(toClientJob),
    output: [result.stdout, result.stderr].filter(Boolean).join("\n").slice(-4000),
  };
}
