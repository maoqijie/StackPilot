import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ScheduleExecutionSchema, type ScheduleExecution } from "@stackpilot/contracts";
import type { CommandResult } from "../../platform/types.js";

const keepExecutionCount = 20;

function shellArg(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function trimOutput(value: string, limit: number) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 14)}\n...[已截断]`;
}

export function scheduleExecution(
  source: ScheduleExecution["source"],
  commandDigest: string,
  startedAt: string,
  result: CommandResult,
): ScheduleExecution {
  return ScheduleExecutionSchema.parse({
    id: randomUUID(),
    commandDigest,
    source,
    startedAt,
    finishedAt: new Date().toISOString(),
    status: result.ok ? "成功" : "失败",
    exitCode: result.exitCode ?? (result.ok ? 0 : null),
    durationMs: Math.max(0, Math.round(result.elapsedMs)),
    output: trimOutput(result.stdout, 16_000),
    error: trimOutput(result.stderr, 8_000),
  });
}

export interface ScheduleExecutionRepository {
  latest(jobId: string, commandDigest: string): Promise<ScheduleExecution | null>;
  write(jobId: string, execution: ScheduleExecution): Promise<void>;
  delete(jobId: string): Promise<void>;
  cronCommand(jobId: string, command: string): string;
}

export function scheduleCommandDigest(command: string) {
  return createHash("sha256").update(command, "utf8").digest("hex");
}

export class FileScheduleExecutionRepository implements ScheduleExecutionRepository {
  constructor(
    private readonly stateDir: string,
    private readonly runnerPath: string,
    private readonly nodePath = process.execPath,
    private readonly workDir = process.cwd(),
  ) {}

  private jobDir(jobId: string) {
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(jobId)) throw new Error("定时任务 ID 非法");
    return join(this.stateDir, jobId);
  }

  async latest(jobId: string, commandDigest: string) {
    const directory = this.jobDir(jobId);
    const files = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    const executions = (await Promise.all(files.filter((file) => file.endsWith(".json")).map(async (file) => {
      try {
        const parsed = JSON.parse(await readFile(join(directory, file), "utf8"));
        const result = ScheduleExecutionSchema.safeParse(parsed);
        return result.success ? result.data : null;
      } catch {
        return null;
      }
    }))).filter((item): item is ScheduleExecution => item?.commandDigest === commandDigest);
    return executions.sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt)
      || Date.parse(right.finishedAt) - Date.parse(left.finishedAt)
      || right.id.localeCompare(left.id))[0] ?? null;
  }

  async write(jobId: string, execution: ScheduleExecution) {
    const directory = this.jobDir(jobId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const target = join(directory, `${execution.startedAt.replaceAll(":", "-")}-${execution.id}.json`);
    const temporary = `${target}.tmp`;
    await writeFile(temporary, `${JSON.stringify(ScheduleExecutionSchema.parse(execution))}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(temporary, target);
    const files = (await readdir(directory)).filter((file) => file.endsWith(".json")).sort().reverse();
    await Promise.all(files.slice(keepExecutionCount).map((file) => rm(join(directory, file), { force: true })));
  }

  async delete(jobId: string) {
    await rm(this.jobDir(jobId), { recursive: true, force: true });
  }

  cronCommand(jobId: string, command: string) {
    const encoded = Buffer.from(command, "utf8").toString("base64url");
    return [this.nodePath, "--preserve-symlinks-main", this.runnerPath, this.stateDir, this.workDir, jobId, scheduleCommandDigest(command), encoded].map(shellArg).join(" ");
  }
}
