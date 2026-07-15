import type { CreateScheduleJobRequest, UpdateScheduleJobRequest } from "@stackpilot/contracts";
import { SchedulePayloadSchema } from "@stackpilot/contracts";
import type { PlatformAdapter } from "../../platform/types.js";
import type { ScheduleRepository, StoredScheduleJob } from "../../repositories/scheduleRepository.js";
import { toScheduleJob } from "../../repositories/scheduleRepository.js";
import { missingRecord } from "../serviceError.js";
import { randomUUID } from "node:crypto";

const now = () => new Date().toLocaleString("zh-CN", { hour12: false });
export class ScheduleService {
  private mutationQueue = Promise.resolve();
  constructor(private readonly repository: ScheduleRepository, private readonly platform: PlatformAdapter, private readonly writeEnabled = false) {}
  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.mutationQueue.catch(() => undefined).then(operation);
    this.mutationQueue = pending.then(() => undefined, () => undefined);
    return pending;
  }
  private find(jobs: StoredScheduleJob[], id: string) {
    const job = this.repository.find(jobs, id);
    if (!job) throw missingRecord("定时任务不存在");
    return job;
  }
  async list() { const state = await this.repository.read(); return SchedulePayloadSchema.parse({ jobs: state.jobs.map(toScheduleJob), scannedAt: new Date().toISOString(), writeEnabled: this.writeEnabled }); }
  create(payload: CreateScheduleJobRequest) { return this.mutate(async () => {
    const state = await this.repository.read(); const timestamp = now();
    const job: StoredScheduleJob = { id: `sp-${randomUUID()}`, name: payload.name, cron: payload.cron, command: payload.command, enabled: payload.enabled ?? true, createdAt: timestamp, updatedAt: timestamp, lastRun: "未运行", result: "未运行" };
    await this.repository.write(state.externalLines, [job, ...state.jobs]);
    return { job: toScheduleJob(job), jobs: [job, ...state.jobs].map(toScheduleJob) };
  }); }
  update(id: string, payload: UpdateScheduleJobRequest) { return this.mutate(async () => {
    const state = await this.repository.read(); const current = this.find(state.jobs, id);
    const next = { ...current, ...payload, updatedAt: now() }; const jobs = state.jobs.map((job) => job.id === id ? next : job);
    await this.repository.write(state.externalLines, jobs); return { job: toScheduleJob(next), jobs: jobs.map(toScheduleJob) };
  }); }
  delete(id: string) { return this.mutate(async () => {
    const state = await this.repository.read(); const current = this.find(state.jobs, id); const jobs = state.jobs.filter((job) => job.id !== id);
    await this.repository.write(state.externalLines, jobs); return { job: toScheduleJob(current), jobs: jobs.map(toScheduleJob) };
  }); }
  run(id: string) { return this.mutate(async () => {
    const state = await this.repository.read(); const current = this.find(state.jobs, id); const startedAt = now(); const result = await this.platform.runScheduledCommand(current.command);
    const latest = await this.repository.read(); const latestJob = this.find(latest.jobs, id);
    const next: StoredScheduleJob = { ...latestJob, lastRun: startedAt, result: result.ok ? "成功" : "失败", updatedAt: now() }; const jobs = latest.jobs.map((job) => job.id === id ? next : job);
    await this.repository.write(latest.externalLines, jobs); return { job: toScheduleJob(next), jobs: jobs.map(toScheduleJob) };
  }); }
}
