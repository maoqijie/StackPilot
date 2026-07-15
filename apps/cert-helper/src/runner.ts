import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { HelperError } from "./types.js";

const execute = promisify(execFile);
export type CommandOutput = { stdout: string; stderr: string };
export type FixedCommandRunner = (executable: string, args: readonly string[], timeoutMs: number, options?: { cwd?: string; env?: NodeJS.ProcessEnv }) => Promise<CommandOutput>;

const ALLOWED = new Set(["/usr/bin/git", "/usr/bin/systemd-run", "/usr/bin/systemctl", "/usr/bin/journalctl", "/usr/sbin/nginx", "/usr/bin/certbot", "/usr/bin/curl", "/usr/bin/tar"]);
const FIREWALL_ALLOWED = new Set(["/usr/sbin/ufw"]);

async function runAllowedCommand(allowed: ReadonlySet<string>, executable: string, args: readonly string[], timeoutMs: number, options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  if (!allowed.has(executable)) throw new HelperError("EXECUTABLE_FORBIDDEN", "Executable is not in the helper allowlist");
  try {
    const result = await execute(executable, [...args], { timeout: timeoutMs, maxBuffer: 256 * 1024, windowsHide: true, cwd: options.cwd, env: options.env });
    return { stdout: result.stdout.slice(0, 256 * 1024), stderr: result.stderr.slice(0, 64 * 1024) };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw new HelperError(code === "ETIMEDOUT" ? "COMMAND_TIMEOUT" : "COMMAND_FAILED", "A fixed helper command failed");
  }
}

export const runFixedCommand: FixedCommandRunner = (executable, args, timeoutMs, options) => runAllowedCommand(ALLOWED, executable, args, timeoutMs, options);
export const runFirewallCommand: FixedCommandRunner = (executable, args, timeoutMs, options) => runAllowedCommand(FIREWALL_ALLOWED, executable, args, timeoutMs, options);

export function builderArgs(workDirectory: string, command: string, args: readonly string[], path?: string) {
  const properties = [
    "--quiet", "--wait", "--collect", "--pipe", "--service-type=exec", "--uid=stackpilot-builder", "--gid=stackpilot-builder",
    "--property=NoNewPrivileges=yes", "--property=PrivateDevices=yes", "--property=PrivateTmp=yes", "--property=ProtectSystem=strict",
    "--property=ProtectHome=yes", "--property=ProtectKernelTunables=yes", "--property=ProtectKernelModules=yes", "--property=ProtectControlGroups=yes",
    "--property=RestrictSUIDSGID=yes", "--property=LockPersonality=yes", "--property=RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6",
    `--property=WorkingDirectory=${workDirectory}`, `--property=ReadWritePaths=${workDirectory}`,
    "--setenv=GIT_TERMINAL_PROMPT=0", "--setenv=GIT_LFS_SKIP_SMUDGE=1", "--setenv=GIT_CONFIG_NOSYSTEM=1",
  ];
  if (path) properties.push(`--setenv=PATH=${path}`);
  return [...properties, "--", command, ...args];
}
