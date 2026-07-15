import type { ScheduleJob } from "@stackpilot/contracts";
import { CronExpressionParser } from "cron-parser";
import { z } from "zod";
import type { PlatformAdapter } from "../platform/types.js";

type CronCommandFactory = { cronCommand(jobId: string, command: string): string };

export type StoredScheduleJob = Omit<ScheduleJob, "nextRun" | "nextRunAt" | "lastExecution"> & { createdAt: string; updatedAt: string };
const StoredScheduleJobSchema: z.ZodType<StoredScheduleJob> = z.object({
  id: z.string(), name: z.string(), cron: z.string(), command: z.string(), enabled: z.boolean(),
  lastRun: z.string(), result: z.enum(["成功", "失败", "未运行", "运行中"]),
  createdAt: z.string(), updatedAt: z.string(),
});
const blockStart = "# >>> STACKPILOT MANAGED CRON JOBS";
const blockEnd = "# <<< STACKPILOT MANAGED CRON JOBS";
const metaPrefix = "# stackpilot:job=";
const idMarker = "# stackpilot:id=";

function decodeJob(value: string): StoredScheduleJob | null {
  try {
    const result = StoredScheduleJobSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
function encodeJob(job: StoredScheduleJob) { return Buffer.from(JSON.stringify(job), "utf8").toString("base64url"); }

export interface ScheduleRepository {
  read(): Promise<{ externalLines: string[]; jobs: StoredScheduleJob[] }>;
  write(externalLines: string[], jobs: StoredScheduleJob[]): Promise<void>;
  find(jobs: StoredScheduleJob[], id: string): StoredScheduleJob | undefined;
}

export class CrontabScheduleRepository implements ScheduleRepository {
  constructor(private readonly platform: PlatformAdapter, private readonly commands: CronCommandFactory) {}
  async read() {
    const raw = await this.platform.readCrontab();
    const lines = raw.split(/\r?\n/);
    const start = lines.findIndex((line) => line.trim() === blockStart);
    const end = lines.findIndex((line, index) => index > start && line.trim() === blockEnd);
    if (start < 0 || end < 0) return { externalLines: lines.filter(Boolean), jobs: [] };
    const jobs = lines.slice(start + 1, end).filter((line) => line.startsWith(metaPrefix)).map((line) => decodeJob(line.slice(metaPrefix.length))).filter((job): job is StoredScheduleJob => job !== null);
    return { externalLines: [...lines.slice(0, start), ...lines.slice(end + 1)].filter(Boolean), jobs };
  }
  async write(externalLines: string[], jobs: StoredScheduleJob[]) {
    const lines = [...externalLines];
    if (jobs.length) {
      if (lines.length) lines.push("");
      lines.push(blockStart);
      for (const job of jobs) {
        lines.push(`${metaPrefix}${encodeJob(job)}`);
        if (job.enabled) lines.push(`${job.cron} ${this.commands.cronCommand(job.id, job.command)} ${idMarker}${job.id}`);
      }
      lines.push(blockEnd);
    }
    await this.platform.writeCrontab(`${lines.join("\n").trim()}\n`);
  }
  find(jobs: StoredScheduleJob[], id: string) {
    return jobs.find((item) => item.id === id);
  }
}

export function nextScheduleRun(cron: string, currentDate = new Date(), timeZone?: string) {
  try {
    return CronExpressionParser.parse(cron, { currentDate, ...(timeZone ? { tz: timeZone } : {}) }).next().toDate().toISOString();
  } catch {
    return null;
  }
}

export function toScheduleJob(job: StoredScheduleJob, currentDate = new Date(), timeZone?: string): ScheduleJob {
  const nextRunAt = job.enabled ? nextScheduleRun(job.cron, currentDate, timeZone) : null;
  return { id: job.id, name: job.name, cron: job.cron, command: job.command, enabled: job.enabled, nextRun: job.enabled ? nextRunAt ?? "时间暂不可用" : "停用", nextRunAt, lastRun: job.lastRun, result: job.result };
}
