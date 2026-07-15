import assert from "node:assert/strict";
import test from "node:test";
import { ScheduleService } from "../../apps/controller/dist/modules/schedules/scheduleService.js";
import { scheduleCommandDigest } from "../../apps/controller/dist/modules/schedules/scheduleExecutionRepository.js";
import { CrontabScheduleRepository } from "../../apps/controller/dist/repositories/scheduleRepository.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";

class MemoryScheduleRepository {
  jobs = [];
  writes = 0;
  async read() { return { externalLines: [], jobs: this.jobs }; }
  async write(_externalLines, jobs) { this.writes += 1; this.jobs = jobs; }
  find(jobs, id) { return jobs.find((item) => item.id === id); }
}

class MemoryScheduleExecutionRepository {
  executions = new Map();
  async latest(jobId, digest) { const execution = this.executions.get(jobId); return execution?.commandDigest === digest ? execution : null; }
  async write(jobId, execution) { this.executions.set(jobId, execution); }
  async delete(jobId) { this.executions.delete(jobId); }
  cronCommand(jobId, command) { return `runner ${jobId} ${scheduleCommandDigest(command)}`; }
}

test("schedule service persists command-versioned execution records", async () => {
  const platform = new FakePlatformAdapter();
  const repository = new MemoryScheduleRepository();
  const executions = new MemoryScheduleExecutionRepository();
  const schedules = new ScheduleService(repository, platform, executions, true);
  const created = await schedules.create({ name: "backup", cron: "0 4 * * *", command: "true", enabled: true, idempotencyKey: "create-backup-1" });
  assert.equal((await schedules.update(created.job.id, { enabled: false })).job.enabled, false);
  const run = await schedules.run(created.job.id, "run-backup-1");
  assert.equal(run.job.lastExecution.source, "manual");
  assert.equal(run.job.lastExecution.exitCode, 0);
  await schedules.delete(created.job.id);
  assert.equal((await schedules.list()).jobs.length, 0);
});

test("schedule mutations serialize and retries do not repeat side effects", async () => {
  const platform = new FakePlatformAdapter();
  const repository = new MemoryScheduleRepository();
  const schedules = new ScheduleService(repository, platform, new MemoryScheduleExecutionRepository(), true);
  const input = { name: "once", cron: "0 3 * * *", command: "true", enabled: true, idempotencyKey: "create-once-1" };
  const [first, second] = await Promise.all([schedules.create(input), schedules.create({ ...input, name: "second", idempotencyKey: "create-second-1" })]);
  assert.equal((await schedules.list()).jobs.length, 2);
  assert.notEqual(first.job.id, second.job.id);
  assert.equal((await schedules.create(input)).job.id, first.job.id);
  const run = await schedules.run(first.job.id, "run-once-1");
  assert.deepEqual(await schedules.run(first.job.id, "run-once-1"), run);
  assert.equal(repository.writes, 2);
  assert.equal(platform.calls.runScheduledCommand, 1);
  await assert.rejects(schedules.create({ ...input, name: "different" }), /幂等键已用于其他定时任务操作/);
});

test("schedule execution preserves concurrent edits and ignores obsolete commands", async () => {
  const platform = new FakePlatformAdapter();
  const repository = new MemoryScheduleRepository();
  const schedules = new ScheduleService(repository, platform, new MemoryScheduleExecutionRepository(), true);
  let releaseRun;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  platform.runScheduledCommand = async () => {
    platform.calls.runScheduledCommand += 1;
    markStarted();
    return new Promise((resolve) => { releaseRun = resolve; });
  };
  const created = await schedules.create({ name: "before", cron: "0 4 * * *", command: "old", enabled: true, idempotencyKey: "create-race-1" });
  const running = schedules.run(created.job.id, "run-race-1");
  await started;
  await assert.rejects(schedules.run(created.job.id, "run-race-2"), /正在执行/);
  await schedules.update(created.job.id, { name: "after", command: "new" });
  releaseRun({ ok: false, stdout: "old output", stderr: "old failure", elapsedMs: 5, exitCode: 9 });
  await assert.rejects(running, /命令已变化/);
  const listed = await schedules.list();
  assert.deepEqual([listed.jobs[0].name, listed.jobs[0].command, listed.jobs[0].lastExecution], ["after", "new", null]);
});

test("crontab repository rejects malformed managed metadata", async () => {
  const platform = new FakePlatformAdapter();
  const invalid = Buffer.from(JSON.stringify({ id: "bad", command: 42 }), "utf8").toString("base64url");
  platform.crontab = `external line\n# >>> STACKPILOT MANAGED CRON JOBS\n# stackpilot:job=${invalid}\n# <<< STACKPILOT MANAGED CRON JOBS\n`;
  const state = await new CrontabScheduleRepository(platform, new MemoryScheduleExecutionRepository()).read();
  assert.deepEqual(state.externalLines, ["external line"]);
  assert.deepEqual(state.jobs, []);
});
