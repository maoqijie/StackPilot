import { execFile, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { promisify } from "node:util";
import { HelperError } from "../domain.js";

const execFileAsync = promisify(execFile);
export type RunResult = { stdout: string; stderr: string };
export type RunOptions = { timeoutMs?: number; input?: string; outputPath?: string; credentialEnvironment?: { PGPASSWORD?: string; MYSQL_PWD?: string } };
export type HelperRunner = { run(executable: string, args: readonly string[], options?: RunOptions): Promise<RunResult> };

const executables = new Set([
  "apt-get", "dnf", "apk", "pacman", "systemctl", "rc-service", "rc-update", "ss", "df", "tar", "sha256sum",
  "psql", "pg_dump", "pg_dumpall", "pg_restore", "mysql", "mariadb", "mysqldump", "mariadb-dump",
]);

export class FixedCommandRunner implements HelperRunner {
  async run(executable: string, args: readonly string[], options: RunOptions = {}): Promise<RunResult> {
    if (!executables.has(executable)) throw new HelperError("COMMAND_DENIED", "database-helper 拒绝未知程序");
    if (args.some((arg) => arg.includes("\0") || arg.length > 4_096)) throw new HelperError("ARGUMENT_DENIED", "database-helper 拒绝无效参数");
    const environment = { PATH: "/usr/sbin:/usr/bin:/sbin:/bin", LANG: "C.UTF-8", LC_ALL: "C.UTF-8", ...options.credentialEnvironment };
    if (options.outputPath) return this.runToFile(executable, args, options.outputPath, options.timeoutMs ?? 30 * 60_000, environment);
    if (options.input !== undefined) return this.runWithInput(executable, args, options.input, options.timeoutMs ?? 30_000, environment);
    const result = await execFileAsync(executable, [...args], {
      encoding: "utf8", timeout: options.timeoutMs ?? 30_000, maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
      env: environment,
    });
    return { stdout: result.stdout, stderr: result.stderr };
  }
  private runWithInput(executable: string, args: readonly string[], input: string, timeoutMs: number, env: NodeJS.ProcessEnv): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, [...args], { env, stdio: ["pipe", "pipe", "pipe"] }); let stdout = "", stderr = "", exceeded = false;
      const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
      const append = (current: string, chunk: Buffer) => { const next = current + chunk.toString("utf8"); if (Buffer.byteLength(next) > 4 * 1024 * 1024) { exceeded = true; child.kill("SIGTERM"); } return next; };
      child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); }); child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("close", (code) => { clearTimeout(timer); if (exceeded) reject(new HelperError("OUTPUT_LIMIT", "数据库工具输出超过限制")); else if (code === 0) resolve({ stdout, stderr }); else reject(new HelperError("COMMAND_FAILED", `数据库工具退出码 ${code ?? "unknown"}`)); });
      child.stdin.on("error", () => undefined); child.stdin.end(input);
    });
  }
  private runToFile(executable: string, args: readonly string[], outputPath: string, timeoutMs: number, env: NodeJS.ProcessEnv): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(outputPath, { flags: "wx", mode: 0o600 });
      const child = spawn(executable, [...args], { env, stdio: ["ignore", "pipe", "pipe"] }); let stderr = "";
      const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
      child.stdout.pipe(output); child.stderr.on("data", (chunk: Buffer) => { if (stderr.length < 16_384) stderr += chunk.toString("utf8"); });
      child.on("error", (error) => { clearTimeout(timer); output.destroy(); reject(error); });
      child.on("close", (code) => { clearTimeout(timer); output.end(() => code === 0 ? resolve({ stdout: "", stderr }) : reject(new HelperError("COMMAND_FAILED", `数据库工具退出码 ${code ?? "unknown"}`))); });
    });
  }
}
