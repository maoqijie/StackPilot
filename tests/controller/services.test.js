import assert from "node:assert/strict";
import test from "node:test";
import { OverviewService } from "../../apps/controller/dist/modules/overview/overviewService.js";
import { RiskService } from "../../apps/controller/dist/modules/risks/riskService.js";
import { ScheduleService } from "../../apps/controller/dist/modules/schedules/scheduleService.js";
import { TaskService } from "../../apps/controller/dist/modules/tasks/taskService.js";
import { MemoryTaskStateRepository } from "../../apps/controller/dist/repositories/taskStateRepository.js";
import { CrontabScheduleRepository } from "../../apps/controller/dist/repositories/scheduleRepository.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";

class MemoryExportRepository {
  writes = [];
  async writeJson(area, payload) { this.writes.push({ area, payload }); return `${area}.json`; }
}

class MemoryScheduleRepository {
  jobs = [];
  async read() { return { externalLines: [], jobs: this.jobs }; }
  async write(_externalLines, jobs) { this.jobs = jobs; }
  find(jobs, id) {
    const job = jobs.find((item) => item.id === id);
    if (!job) throw new Error("not found");
    return job;
  }
}

test("overview, task and risk services run against a fake platform", async () => {
  const platform = new FakePlatformAdapter();
  const state = new MemoryTaskStateRepository();
  const exports = new MemoryExportRepository();
  const overview = new OverviewService(platform, state);
  const tasks = new TaskService(overview, state, exports);
  const risks = new RiskService(overview, exports);

  const summary = await overview.getOverview();
  assert.equal(summary.nodes[0].id, "node-local");
  assert.equal(summary.tasks[0].id, "task-test");
  assert.equal((await tasks.run("task-test")).task.id, "task-test");
  assert.ok(Array.isArray((await risks.scan()).risks));
  await tasks.export();
  await risks.export();
  assert.deepEqual(exports.writes.map((write) => write.area), ["overview-tasks", "overview-risks"]);
  assert.equal(platform.calls.writeCrontab, 0);
  assert.equal(platform.calls.runScheduledCommand, 0);
});

test("schedule service performs storage and execution only through injected interfaces", async () => {
  const platform = new FakePlatformAdapter();
  const repository = new MemoryScheduleRepository();
  const schedules = new ScheduleService(repository, platform);
  const created = await schedules.create({ name: "backup", cron: "0 4 * * *", command: "true", enabled: true });
  assert.equal(created.job.name, "backup");
  assert.equal((await schedules.update(created.job.id, { enabled: false })).job.enabled, false);
  const run = await schedules.run(created.job.id);
  assert.equal(run.job.result, "成功");
  assert.equal(platform.calls.runScheduledCommand, 1);
  await schedules.delete(created.job.id);
  assert.equal((await schedules.list()).jobs.length, 0);
});

test("task service reports a stable 404 for missing tasks", async () => {
  const platform = new FakePlatformAdapter();
  const state = new MemoryTaskStateRepository();
  const overview = new OverviewService(platform, state);
  const tasks = new TaskService(overview, state, new MemoryExportRepository());
  await assert.rejects(() => tasks.run("missing"), (error) => error.status === 404 && error.code === "NOT_FOUND");
});

test("crontab repository rejects malformed managed metadata", async () => {
  const platform = new FakePlatformAdapter();
  const invalid = Buffer.from(JSON.stringify({ id: "bad", command: 42 }), "utf8").toString("base64url");
  platform.crontab = `external line\n# >>> STACKPILOT MANAGED CRON JOBS\n# stackpilot:job=${invalid}\n# <<< STACKPILOT MANAGED CRON JOBS\n`;
  const state = await new CrontabScheduleRepository(platform).read();
  assert.deepEqual(state.externalLines, ["external line"]);
  assert.deepEqual(state.jobs, []);
});
