import { randomUUID } from "node:crypto";
import type { CreateScheduleJobRequest, ScheduleJob, UpdateScheduleJobRequest } from "@stackpilot/contracts";
import { SchedulePayloadSchema } from "@stackpilot/contracts";
import type { PlatformAdapter } from "../../platform/types.js";
import type { ScheduleRepository, StoredScheduleJob } from "../../repositories/scheduleRepository.js";
import { toScheduleJob } from "../../repositories/scheduleRepository.js";
import { missingRecord, ServiceError } from "../serviceError.js";
import { scheduleCommandDigest, scheduleExecution, type ScheduleExecutionRepository } from "./scheduleExecutionRepository.js";

const now = () => new Date().toISOString();
type ScheduleMutationResult = { job: ScheduleJob; jobs: ScheduleJob[] };

export class ScheduleService {
  private mutationQueue = Promise.resolve();
  private readonly completedRequests = new Map<string, { fingerprint: string; result: ScheduleMutationResult }>();
  private readonly runningJobIds = new Set<string>();

  constructor(
    private readonly repository: ScheduleRepository,
    private readonly platform: PlatformAdapter,
    private readonly executions: ScheduleExecutionRepository,
    private readonly writeEnabled = false,
  ) {}

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

  private async jobs(stored: StoredScheduleJob[]): Promise<ScheduleJob[]> {
    return Promise.all(stored.map(async (job) => {
      const execution = await this.executions.latest(job.id, scheduleCommandDigest(job.command));
      return { ...toScheduleJob(job), ...(execution ? { lastRun: execution.startedAt, result: execution.status, lastExecution: execution } : { lastExecution: null }) };
    }));
  }

  private idempotent(key: string, fingerprint: string, operation: () => Promise<ScheduleMutationResult>) {
    return this.mutate(async () => {
      const completed = this.completedRequests.get(key);
      if (completed) {
        if (completed.fingerprint !== fingerprint) throw new ServiceError(409, "BAD_REQUEST", "幂等键已用于其他定时任务操作");
        const current = await this.repository.read();
        return { job: completed.result.job, jobs: await this.jobs(current.jobs) };
      }
      const result = await operation();
      this.completedRequests.set(key, { fingerprint, result });
      if (this.completedRequests.size > 100) this.completedRequests.delete(this.completedRequests.keys().next().value!);
      return result;
    });
  }

  async list() {
    const state = await this.repository.read();
    return SchedulePayloadSchema.parse({ jobs: await this.jobs(state.jobs), scannedAt: now(), writeEnabled: this.writeEnabled });
  }

  create(payload: CreateScheduleJobRequest, userId = "system") {
    return this.idempotent(`create:${userId}:${payload.idempotencyKey}`, JSON.stringify(payload), async () => {
      const state = await this.repository.read(); const timestamp = now();
      const job: StoredScheduleJob = { id: `sp-${randomUUID()}`, name: payload.name, cron: payload.cron, command: payload.command, enabled: payload.enabled ?? true, createdAt: timestamp, updatedAt: timestamp, lastRun: "未运行", result: "未运行" };
      const stored = [job, ...state.jobs];
      await this.repository.write(state.externalLines, stored);
      const jobs = await this.jobs(stored);
      return { job: jobs[0]!, jobs };
    });
  }

  update(id: string, payload: UpdateScheduleJobRequest) {
    return this.mutate(async () => {
      const state = await this.repository.read(); const current = this.find(state.jobs, id);
      const next = { ...current, ...payload, updatedAt: now() }; const stored = state.jobs.map((job) => job.id === id ? next : job);
      await this.repository.write(state.externalLines, stored);
      if (payload.command !== undefined && payload.command !== current.command) await this.executions.delete(id);
      const jobs = await this.jobs(stored);
      return { job: jobs.find((job) => job.id === id)!, jobs };
    });
  }

  delete(id: string) {
    return this.mutate(async () => {
      const state = await this.repository.read(); const current = this.find(state.jobs, id); const stored = state.jobs.filter((job) => job.id !== id);
      await this.repository.write(state.externalLines, stored);
      await this.executions.delete(id);
      return { job: toScheduleJob(current), jobs: await this.jobs(stored) };
    });
  }

  async run(id: string, idempotencyKey: string, userId = "system") {
    const requestKey = `run:${userId}:${id}:${idempotencyKey}`;
    const completed = this.completedRequests.get(requestKey);
    if (completed) return this.idempotent(requestKey, id, async () => completed.result);
    if (this.runningJobIds.has(id)) throw new ServiceError(409, "BAD_REQUEST", "定时任务正在执行，请等待本次执行完成");
    this.runningJobIds.add(id);
    try {
      const command = await this.mutate(async () => {
        const state = await this.repository.read();
        return this.find(state.jobs, id).command;
      });
      const digest = scheduleCommandDigest(command);
      const startedAt = now();
      const result = await this.platform.runScheduledCommand(command);
      const execution = scheduleExecution("manual", digest, startedAt, result);
      const mutation = await this.mutate(async () => {
        const state = await this.repository.read(); const latest = this.find(state.jobs, id);
        if (scheduleCommandDigest(latest.command) !== digest) throw new ServiceError(409, "BAD_REQUEST", "任务命令已变化，旧命令的执行结果未保存");
        await this.executions.write(id, execution);
        const jobs = await this.jobs(state.jobs);
        return { job: jobs.find((job) => job.id === id)!, jobs };
      });
      this.completedRequests.set(requestKey, { fingerprint: id, result: mutation });
      if (this.completedRequests.size > 100) this.completedRequests.delete(this.completedRequests.keys().next().value!);
      return mutation;
    } finally {
      this.runningJobIds.delete(id);
    }
  }
}
