import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CommandResult } from "./types.js";

const execFileAsync = promisify(execFile);
const allowedExecutables = new Set(["git", "crontab", "systemctl", "launchctl", "lsof", "ps", "du", "/bin/sh"]);

export async function runFixedCommand(executable: string, args: readonly string[], options: { cwd?: string; timeoutMs?: number; maxBuffer?: number } = {}): Promise<CommandResult> {
  if (!allowedExecutables.has(executable)) throw new Error("平台适配器拒绝未知可执行文件");
  const startedAt = performance.now();
  try {
    const { stdout, stderr } = await execFileAsync(executable, [...args], {
      cwd: options.cwd,
      timeout: options.timeoutMs ?? 2500,
      maxBuffer: options.maxBuffer ?? 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim(), elapsedMs: Math.max(1, Math.round(performance.now() - startedAt)) };
  } catch (caught) {
    const error = caught as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    return {
      ok: false,
      stdout: String(error.stdout ?? "").trim(),
      stderr: String(error.stderr ?? error.message).trim(),
      elapsedMs: Math.max(1, Math.round(performance.now() - startedAt)),
    };
  }
}
