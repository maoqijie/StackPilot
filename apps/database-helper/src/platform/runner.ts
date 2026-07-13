import { execFile, spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { promisify } from "node:util";
import { HelperError } from "../domain.js";

const execFileAsync = promisify(execFile);
export type RunResult = { stdout: string; stderr: string };
export type RunOptions = {
  timeoutMs?: number; input?: string; inputPath?: string; outputPath?: string; uid?: number; gid?: number;
  credentialEnvironment?: { PGPASSWORD?: string; MYSQL_PWD?: string };
};
export type HelperRunner = { run(executable: string, args: readonly string[], options?: RunOptions): Promise<RunResult> };

const executables = new Set([
  "apt-get", "dnf", "apk", "pacman", "systemctl", "rc-service", "rc-update", "ss", "df", "tar", "sha256sum",
  "psql", "createdb", "pg_dump", "pg_dumpall", "pg_restore", "pg_isready", "mysql", "mariadb", "mysqldump", "mariadb-dump", "mysqladmin", "mariadb-admin", "openssl",
  "/usr/lib/postgresql/15/bin/initdb", "/usr/lib/postgresql/15/bin/postgres",
  "/usr/lib/postgresql/16/bin/initdb", "/usr/lib/postgresql/16/bin/postgres",
  "/usr/bin/initdb", "/usr/bin/postgres", "/usr/sbin/mysqld", "/usr/libexec/mysqld",
  "/usr/sbin/mariadbd", "/usr/libexec/mariadbd", "/usr/bin/mariadbd", "/usr/bin/mariadb-install-db",
]);

export class FixedCommandRunner implements HelperRunner {
  async run(executable: string, args: readonly string[], options: RunOptions = {}): Promise<RunResult> {
    if (!executables.has(executable)) throw new HelperError("COMMAND_DENIED", "database-helper 拒绝未知程序");
    if (args.some((arg) => arg.includes("\0") || arg.length > 4_096)) throw new HelperError("ARGUMENT_DENIED", "database-helper 拒绝无效参数");
    if (options.input !== undefined && options.inputPath !== undefined) throw new HelperError("INPUT_CONFLICT", "数据库工具不能同时接收两种输入");
    if ((options.uid !== undefined && (!Number.isInteger(options.uid) || options.uid < 0)) || (options.gid !== undefined && (!Number.isInteger(options.gid) || options.gid < 0))) throw new HelperError("IDENTITY_DENIED", "数据库工具运行身份无效");
    const environment = { PATH: "/usr/sbin:/usr/bin:/sbin:/bin", LANG: "C.UTF-8", LC_ALL: "C.UTF-8", ...options.credentialEnvironment };
    const identity = { ...(options.uid === undefined ? {} : { uid: options.uid }), ...(options.gid === undefined ? {} : { gid: options.gid }) };
    if (options.outputPath) return this.runToFile(executable, args, options.outputPath, options.timeoutMs ?? 30 * 60_000, environment, identity);
    if (options.input !== undefined || options.inputPath !== undefined) return this.runWithInput(executable, args, options.input, options.inputPath, options.timeoutMs ?? 30_000, environment, identity);
    const result = await execFileAsync(executable, [...args], {
      encoding: "utf8", timeout: options.timeoutMs ?? 30_000, maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
      env: environment,
      ...identity,
    });
    return { stdout: result.stdout, stderr: result.stderr };
  }
  private runWithInput(executable: string, args: readonly string[], input: string | undefined, inputPath: string | undefined, timeoutMs: number, env: NodeJS.ProcessEnv, identity: { uid?: number; gid?: number }): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, [...args], { env, stdio: ["pipe", "pipe", "pipe"], ...identity }); let stdout = "", stderr = "", exceeded = false;
      const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
      const append = (current: string, chunk: Buffer) => { const next = current + chunk.toString("utf8"); if (Buffer.byteLength(next) > 4 * 1024 * 1024) { exceeded = true; child.kill("SIGTERM"); } return next; };
      child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); }); child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("close", (code) => { clearTimeout(timer); if (exceeded) reject(new HelperError("OUTPUT_LIMIT", "数据库工具输出超过限制")); else if (code === 0) resolve({ stdout, stderr }); else reject(new HelperError("COMMAND_FAILED", `数据库工具退出码 ${code ?? "unknown"}`)); });
      child.stdin.on("error", () => undefined);
      if (inputPath) createReadStream(inputPath).on("error", reject).pipe(child.stdin); else child.stdin.end(input ?? "");
    });
  }
  private runToFile(executable: string, args: readonly string[], outputPath: string, timeoutMs: number, env: NodeJS.ProcessEnv, identity: { uid?: number; gid?: number }): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(outputPath, { flags: "wx", mode: 0o600 });
      const child = spawn(executable, [...args], { env, stdio: ["ignore", "pipe", "pipe"], ...identity }); let stderr = "";
      const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
      child.stdout.pipe(output); child.stderr.on("data", (chunk: Buffer) => { if (stderr.length < 16_384) stderr += chunk.toString("utf8"); });
      child.on("error", (error) => { clearTimeout(timer); output.destroy(); reject(error); });
      child.on("close", (code) => { clearTimeout(timer); output.end(() => code === 0 ? resolve({ stdout: "", stderr }) : reject(new HelperError("COMMAND_FAILED", `数据库工具退出码 ${code ?? "unknown"}`))); });
    });
  }
}
