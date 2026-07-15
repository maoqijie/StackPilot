import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
type PlatformProbeResult =
  | { ok: true; output: string }
  | { ok: false; output: string; errorOutput: string; code: string | number };

export async function runPlatformProbe(executable: string, args: readonly string[], signal: AbortSignal, timeoutMs: number, maxOutputBytes: number): Promise<PlatformProbeResult> {
  const allowed = new Set(["systemctl", "journalctl", "launchctl", "sc.exe"]);
  if (!allowed.has(executable)) throw new Error("Agent 拒绝未知平台程序");
  try {
    const { stdout } = await execFileAsync(executable, [...args], { signal, timeout: timeoutMs, maxBuffer: maxOutputBytes, windowsHide: true });
    return { ok: true, output: stdout.slice(0, maxOutputBytes) };
  } catch (error) {
    const failure = error as { code?: string | number; stdout?: string; stderr?: string };
    const code = failure.code ?? "PROBE_FAILED";
    return {
      ok: false,
      output: String(failure.stdout ?? "").slice(0, maxOutputBytes),
      errorOutput: String(failure.stderr ?? "").slice(0, maxOutputBytes),
      code,
    };
  }
}
