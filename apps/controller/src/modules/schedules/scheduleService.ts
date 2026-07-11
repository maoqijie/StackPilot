import type { CreateScheduleJobRequest, UpdateScheduleJobRequest } from "@stackpilot/contracts";
import { SchedulePayloadSchema } from "@stackpilot/contracts";
import type { PlatformAdapter } from "../../platform/types.js";
import type { ScheduleRepository, StoredScheduleJob } from "../../repositories/scheduleRepository.js";
import { toScheduleJob } from "../../repositories/scheduleRepository.js";
import { missingRecord } from "../serviceError.js";

const now = () => new Date().toLocaleString("zh-CN", { hour12: false });
export class ScheduleService {
  constructor(private readonly repository: ScheduleRepository, private readonly platform: PlatformAdapter) {}
  private find(jobs: StoredScheduleJob[], id: string) {
    const job = this.repository.find(jobs, id);
    if (!job) throw missingRecord("定时任务不存在");
    return job;
  }
  async list() { const state = await this.repository.read(); return SchedulePayloadSchema.parse({ jobs: state.jobs.map(toScheduleJob), scannedAt: now() }); }
  async create(payload: CreateScheduleJobRequest) {
    const state = await this.repository.read(); const timestamp = now();
    const job: StoredScheduleJob = { id: `sp-${Date.now().toString(36)}`, name: payload.name, cron: payload.cron, command: payload.command, enabled: payload.enabled ?? true, createdAt: timestamp, updatedAt: timestamp, lastRun: "未运行", result: "未运行" };
    await this.repository.write(state.externalLines, [job, ...state.jobs]);
    return { job: toScheduleJob(job), jobs: [job, ...state.jobs].map(toScheduleJob) };
  }
  async update(id: string, payload: UpdateScheduleJobRequest) {
    const state = await this.repository.read(); const current = this.find(state.jobs, id);
    const next = { ...current, ...payload, updatedAt: now() }; const jobs = state.jobs.map((job) => job.id === id ? next : job);
    await this.repository.write(state.externalLines, jobs); return { job: toScheduleJob(next), jobs: jobs.map(toScheduleJob) };
  }
  async delete(id: string) {
    const state = await this.repository.read(); const current = this.find(state.jobs, id); const jobs = state.jobs.filter((job) => job.id !== id);
    await this.repository.write(state.externalLines, jobs); return { job: toScheduleJob(current), jobs: jobs.map(toScheduleJob) };
  }
  async run(id: string) {
    const state = await this.repository.read(); const current = this.find(state.jobs, id); const startedAt = now(); const result = await this.platform.runScheduledCommand(current.command);
    const next: StoredScheduleJob = { ...current, lastRun: startedAt, result: result.ok ? "成功" : "失败", updatedAt: now() }; const jobs = state.jobs.map((job) => job.id === id ? next : job);
    await this.repository.write(state.externalLines, jobs); return { job: toScheduleJob(next), jobs: jobs.map(toScheduleJob) };
  }
}
