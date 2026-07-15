import { ScheduleJobSchema, type ScheduleJob } from "@stackpilot/contracts";
import { z } from "zod";
import type { PlatformAdapter } from "../platform/types.js";

type CronCommandFactory = { cronCommand(jobId: string, command: string): string };

export type StoredScheduleJob = Omit<ScheduleJob, "nextRun"> & { createdAt: string; updatedAt: string };
const StoredScheduleJobSchema = ScheduleJobSchema.omit({ nextRun: true }).extend({ createdAt: z.string(), updatedAt: z.string() });
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

export function toScheduleJob(job: StoredScheduleJob): ScheduleJob {
  return { id: job.id, name: job.name, cron: job.cron, command: job.command, enabled: job.enabled, nextRun: job.enabled ? "已写入 crontab" : "停用", lastRun: job.lastRun, result: job.result };
}
