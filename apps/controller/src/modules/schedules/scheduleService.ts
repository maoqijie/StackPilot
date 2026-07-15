import type { CreateScheduleJobRequest, ScheduleJob, UpdateScheduleJobRequest } from "@stackpilot/contracts";
import { SchedulePayloadSchema } from "@stackpilot/contracts";
import type { PlatformAdapter } from "../../platform/types.js";
import type { ScheduleRepository, StoredScheduleJob } from "../../repositories/scheduleRepository.js";
import { toScheduleJob } from "../../repositories/scheduleRepository.js";
import { missingRecord } from "../serviceError.js";
import { scheduleExecution, type ScheduleExecutionRepository } from "./scheduleExecutionRepository.js";

const now = () => new Date().toISOString();
export class ScheduleService {
  constructor(
    private readonly repository: ScheduleRepository,
    private readonly platform: PlatformAdapter,
    private readonly executions: ScheduleExecutionRepository,
    private readonly writable: boolean,
  ) {}
  private find(jobs: StoredScheduleJob[], id: string) {
    const job = this.repository.find(jobs, id);
    if (!job) throw missingRecord("定时任务不存在");
    return job;
  }
  private async jobs(stored: StoredScheduleJob[]): Promise<ScheduleJob[]> {
    return Promise.all(stored.map(async (job) => {
      const execution = await this.executions.latest(job.id);
      return { ...toScheduleJob(job), ...(execution ? { lastRun: execution.startedAt, result: execution.status, lastExecution: execution } : { lastExecution: null }) };
    }));
  }
  async list() { const state = await this.repository.read(); return SchedulePayloadSchema.parse({ jobs: await this.jobs(state.jobs), scannedAt: now(), writable: this.writable }); }
  async create(payload: CreateScheduleJobRequest) {
    const state = await this.repository.read(); const timestamp = now();
    const job: StoredScheduleJob = { id: `sp-${Date.now().toString(36)}`, name: payload.name, cron: payload.cron, command: payload.command, enabled: payload.enabled ?? true, createdAt: timestamp, updatedAt: timestamp, lastRun: "未运行", result: "未运行" };
    await this.repository.write(state.externalLines, [job, ...state.jobs]);
    const jobs = await this.jobs([job, ...state.jobs]);
    return { job: jobs[0]!, jobs, writable: this.writable };
  }
  async update(id: string, changes: UpdateScheduleJobRequest) {
    const state = await this.repository.read(); const current = this.find(state.jobs, id);
    if (changes.command !== undefined && changes.command !== current.command) await this.executions.delete(id);
    const next = { ...current, ...changes, updatedAt: now() }; const jobs = state.jobs.map((job) => job.id === id ? next : job);
    await this.repository.write(state.externalLines, jobs); const result = await this.jobs(jobs); return { job: result.find((job) => job.id === id)!, jobs: result, writable: this.writable };
  }
  async delete(id: string) {
    const state = await this.repository.read(); const current = this.find(state.jobs, id); const jobs = state.jobs.filter((job) => job.id !== id);
    await this.repository.write(state.externalLines, jobs); await this.executions.delete(id); return { job: toScheduleJob(current), jobs: await this.jobs(jobs), writable: this.writable };
  }
  async run(id: string) {
    const state = await this.repository.read(); const current = this.find(state.jobs, id); const startedAt = now(); const commandResult = await this.platform.runScheduledCommand(current.command);
    const execution = scheduleExecution("manual", startedAt, commandResult); await this.executions.write(id, execution);
    const next: StoredScheduleJob = { ...current, lastRun: execution.startedAt, result: execution.status, updatedAt: now() }; const jobs = state.jobs.map((job) => job.id === id ? next : job);
    await this.repository.write(state.externalLines, jobs); const result = await this.jobs(jobs); return { job: result.find((job) => job.id === id)!, jobs: result, writable: this.writable };
  }
}
