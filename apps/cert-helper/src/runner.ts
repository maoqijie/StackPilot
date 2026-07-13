import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { HelperError } from "./types.js";

const execute = promisify(execFile);
export type CommandOutput = { stdout: string; stderr: string };
export type FixedCommandRunner = (executable: string, args: readonly string[], timeoutMs: number) => Promise<CommandOutput>;

const ALLOWED = new Set(["/usr/bin/systemctl", "/usr/sbin/nginx", "/usr/bin/certbot"]);

export const runFixedCommand: FixedCommandRunner = async (executable, args, timeoutMs) => {
  if (!ALLOWED.has(executable)) throw new HelperError("EXECUTABLE_FORBIDDEN", "Executable is not in the helper allowlist");
  try {
    const result = await execute(executable, [...args], { timeout: timeoutMs, maxBuffer: 64 * 1024, windowsHide: true });
    return { stdout: result.stdout.slice(0, 64 * 1024), stderr: result.stderr.slice(0, 64 * 1024) };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw new HelperError(code === "ETIMEDOUT" ? "COMMAND_TIMEOUT" : "COMMAND_FAILED", "A fixed helper command failed");
  }
};
