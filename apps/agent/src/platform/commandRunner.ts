import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export async function runPlatformProbe(executable: string, args: readonly string[], signal: AbortSignal, timeoutMs: number, maxOutputBytes: number) {
  const allowed = new Set(["systemctl", "journalctl", "launchctl", "sc.exe"]);
  if (!allowed.has(executable)) throw new Error("Agent 拒绝未知平台程序");
  try {
    const { stdout } = await execFileAsync(executable, [...args], { signal, timeout: timeoutMs, maxBuffer: maxOutputBytes, windowsHide: true });
    return { ok: true, output: stdout.slice(0, maxOutputBytes) };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "PROBE_FAILED";
    return { ok: false, output: "", code };
  }
}
