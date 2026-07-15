import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import test from "node:test";
import { FileScheduleExecutionRepository, scheduleCommandDigest, scheduleExecution } from "../../apps/controller/dist/modules/schedules/scheduleExecutionRepository.js";
import { CrontabScheduleRepository } from "../../apps/controller/dist/repositories/scheduleRepository.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";
import { runFixedCommand } from "../../apps/controller/dist/platform/commandRunner.js";

test("managed crontab uses the bounded runner instead of embedding the raw command", async () => {
  const platform = new FakePlatformAdapter();
  const executions = new FileScheduleExecutionRepository("/state/schedules", "/release/scheduleRunner.js", "/node/bin/node", "/release");
  const repository = new CrontabScheduleRepository(platform, executions);
  const job = {
    id: "sp-job-1", name: "backup", cron: "0 4 * * *", command: "printf 'secret value'", enabled: true,
    createdAt: "2026-07-15T02:00:00.000Z", updatedAt: "2026-07-15T02:00:00.000Z", lastRun: "未运行", result: "未运行",
  };
  await repository.write(["MAILTO=ops@example.com"], [job]);
  assert.match(platform.crontab, /MAILTO=ops@example\.com/);
  assert.match(platform.crontab, /'\/node\/bin\/node' '--preserve-symlinks-main' '\/release\/scheduleRunner\.js' '\/state\/schedules' '\/release' 'sp-job-1'/);
  assert.doesNotMatch(platform.crontab, /secret value/);
  assert.match(platform.crontab, /# stackpilot:id=sp-job-1/);
});

test("compiled cron runner records a real failed process result", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-schedule-runner-"));
  const repoRoot = resolve(import.meta.dirname, "../..");
  const runner = join(repoRoot, "apps/controller/dist/modules/schedules/scheduleRunner.js");
  const rawCommand = "printf 'cron failed' >&2; exit 17";
  const digest = scheduleCommandDigest(rawCommand);
  const command = Buffer.from(rawCommand, "utf8").toString("base64url");
  try {
    const processResult = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["--preserve-symlinks-main", runner, root, repoRoot, "sp-job-runner", digest, command], { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.once("error", reject);
      child.once("exit", (code) => resolve({ code, stderr }));
    });
    assert.equal(processResult.code, 17, processResult.stderr);
    const execution = await new FileScheduleExecutionRepository(root, runner).latest("sp-job-runner", digest);
    assert.equal(execution.source, "cron");
    assert.equal(execution.status, "失败");
    assert.equal(execution.exitCode, 17);
    assert.equal(execution.error, "cron failed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("execution repository persists the latest real exit status atomically", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-schedule-results-"));
  try {
    const repository = new FileScheduleExecutionRepository(root, "/runner.js");
    const digest = scheduleCommandDigest("true");
    const first = scheduleExecution("cron", digest, "2026-07-15T02:00:00.000Z", { ok: false, stdout: "partial", stderr: "target unavailable", elapsedMs: 42, exitCode: 23 });
    const second = scheduleExecution("manual", digest, "2026-07-15T03:00:00.000Z", { ok: true, stdout: "done", stderr: "", elapsedMs: 11, exitCode: 0 });
    await repository.write("sp-job-1", first);
    await repository.write("sp-job-1", second);
    assert.deepEqual(await repository.latest("sp-job-1", digest), second);
    const raw = await readFile(join(root, "sp-job-1", `${second.startedAt.replaceAll(":", "-")}-${second.id}.json`), "utf8");
    assert.equal(JSON.parse(raw).exitCode, 0);
    await repository.delete("sp-job-1");
    assert.equal(await repository.latest("sp-job-1", digest), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("scheduled command timeout kills the entire derived process group", { skip: process.platform === "win32" }, async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-schedule-timeout-"));
  const marker = join(root, "should-not-exist");
  try {
    const command = `(sleep 0.25; printf late > '${marker}') & wait`;
    const result = await runFixedCommand("/bin/sh", ["-lc", command], { timeoutMs: 30, killProcessGroup: true });
    assert.equal(result.ok, false);
    assert.match(result.stderr, /超时/);
    await new Promise((resolve) => setTimeout(resolve, 350));
    await assert.rejects(access(marker), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
