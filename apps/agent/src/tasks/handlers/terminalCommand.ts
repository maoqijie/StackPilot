import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { promisify } from "node:util";
import type { RemoteTaskResultSummary } from "@stackpilot/contracts";
import { TerminalCommandTaskParametersSchema } from "@stackpilot/contracts";

const execFileAsync = promisify(execFile);
const MAX_RESULT_BYTES = 1_024;
const PROCESS_BUFFER_BYTES = 64 * 1_024;

type TerminalCommandParameters = ReturnType<typeof TerminalCommandTaskParametersSchema.parse>;
const TERMINAL_EXECUTABLES = ["/usr/bin/df", "/usr/bin/uptime", "/usr/bin/top", "/usr/bin/systemctl"] as const;
type TerminalCommandInvocation = { executable: typeof TERMINAL_EXECUTABLES[number]; args: readonly string[] };
type TerminalCommandRunner = (executable: string, args: readonly string[], options: { signal: AbortSignal; maxBuffer: number; windowsHide: boolean }) => Promise<{ stdout: string; stderr: string }>;

export function terminalCommandInvocation(parameters: TerminalCommandParameters): TerminalCommandInvocation {
  switch (parameters.command) {
    case "disk-usage": return { executable: "/usr/bin/df", args: ["-h"] };
    case "uptime": return { executable: "/usr/bin/uptime", args: [] };
    case "top-summary": return { executable: "/usr/bin/top", args: ["-b", "-n", "1"] };
    case "service-status": return { executable: "/usr/bin/systemctl", args: ["status", parameters.serviceName, "--no-pager"] };
  }
}

export function terminalCommandsAvailable(check: (path: string) => boolean = (path) => { try { accessSync(path, constants.X_OK); return true; } catch { return false; } }) {
  return TERMINAL_EXECUTABLES.every(check);
}

export function truncateTerminalOutput(value: string, maxBytes = MAX_RESULT_BYTES) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length <= maxBytes) return { output: value, truncated: false };
  let end = maxBytes;
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end -= 1;
  return { output: bytes.subarray(0, end).toString("utf8"), truncated: true };
}

function commandOutput(stdout: string, stderr: string) {
  return [stdout.trimEnd(), stderr.trimEnd()].filter(Boolean).join("\n") || "(no output)";
}

export async function terminalCommandHandler(raw: unknown, signal: AbortSignal, run: TerminalCommandRunner = execFileAsync as TerminalCommandRunner): Promise<RemoteTaskResultSummary> {
  const invocation = terminalCommandInvocation(TerminalCommandTaskParametersSchema.parse(raw));
  let stdout = "";
  let stderr = "";
  let exitCode: number | null = 0;
  try {
    const result = await run(invocation.executable, invocation.args, {
      signal,
      maxBuffer: PROCESS_BUFFER_BYTES,
      windowsHide: true,
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (reason) {
    if (signal.aborted || (reason instanceof Error && reason.name === "AbortError")) throw reason;
    const error = reason as Error & { code?: string | number; stdout?: string; stderr?: string };
    stdout = typeof error.stdout === "string" ? error.stdout : "";
    stderr = typeof error.stderr === "string" ? error.stderr : error.message;
    exitCode = typeof error.code === "number" ? error.code : null;
  }
  const result = truncateTerminalOutput(commandOutput(stdout, stderr));
  return { message: result.output, truncated: result.truncated, data: { exitCode } };
}
