import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { CommandResult } from "./types.js";

const execFileAsync = promisify(execFile);
const allowedExecutables = new Set(["git", "crontab", "systemctl", "launchctl", "lsof", "ps", "du", "/bin/sh", "/usr/bin/psql"]);

async function runProcessGroup(executable: string, args: readonly string[], options: { cwd?: string; timeoutMs?: number; maxBuffer?: number }): Promise<CommandResult> {
  const startedAt = performance.now();
  const maxBuffer = options.maxBuffer ?? 1024 * 1024;
  return new Promise((resolve) => {
    const child = spawn(executable, [...args], { cwd: options.cwd, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let overflowed = false;
    const collect = (chunks: Buffer[], chunk: Buffer, current: number) => {
      const remaining = maxBuffer - current;
      if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
      if (chunk.length > remaining) overflowed = true;
      return current + chunk.length;
    };
    child.stdout.on("data", (chunk: Buffer) => { stdoutBytes = collect(stdout, chunk, stdoutBytes); });
    child.stderr.on("data", (chunk: Buffer) => { stderrBytes = collect(stderr, chunk, stderrBytes); });
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid!, "SIGKILL"); } catch { child.kill("SIGKILL"); }
    }, options.timeoutMs ?? 2500);
    child.once("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout: Buffer.concat(stdout).toString("utf8").trim(), stderr: error.message, elapsedMs: Math.max(1, Math.round(performance.now() - startedAt)), exitCode: null });
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      const message = timedOut ? "命令执行超时" : overflowed ? "命令输出超过限制" : Buffer.concat(stderr).toString("utf8").trim();
      resolve({ ok: code === 0 && !timedOut && !overflowed, stdout: Buffer.concat(stdout).toString("utf8").trim(), stderr: message, elapsedMs: Math.max(1, Math.round(performance.now() - startedAt)), exitCode: typeof code === "number" ? code : null });
    });
  });
}

export async function runFixedCommand(executable: string, args: readonly string[], options: { cwd?: string; timeoutMs?: number; maxBuffer?: number; killProcessGroup?: boolean } = {}): Promise<CommandResult> {
  if (!allowedExecutables.has(executable)) throw new Error("平台适配器拒绝未知可执行文件");
  if (options.killProcessGroup && process.platform !== "win32") return runProcessGroup(executable, args, options);
  const startedAt = performance.now();
  try {
    const { stdout, stderr } = await execFileAsync(executable, [...args], {
      cwd: options.cwd,
      timeout: options.timeoutMs ?? 2500,
      maxBuffer: options.maxBuffer ?? 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim(), elapsedMs: Math.max(1, Math.round(performance.now() - startedAt)), exitCode: 0 };
  } catch (caught) {
    const error = caught as { code?: string | number; message?: string; stdout?: string; stderr?: string };
    return {
      ok: false,
      stdout: String(error.stdout ?? "").trim(),
      stderr: String(error.stderr ?? error.message).trim(),
      elapsedMs: Math.max(1, Math.round(performance.now() - startedAt)),
      exitCode: typeof error.code === "number" ? error.code : null,
    };
  }
}
