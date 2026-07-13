import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BackupScheduleStore, cronMatches, parseCron, ScheduledBackupExecutor } from "../../apps/database-helper/dist/operations/backupScheduler.js";
import { BackupSchedulerInstaller } from "../../apps/database-helper/dist/operations/backupSchedulerInstaller.js";
import { acquireInstanceLock, acquireProcessLock } from "../../apps/database-helper/dist/operations/instanceLock.js";

test("structured backup cron accepts bounded five-field expressions and rejects commands or paths", () => {
  assert.deepEqual(parseCron("15 2 * * 1-5"), ["15", "2", "*", "*", "1-5"]);
  assert.equal(cronMatches("*/5 * * * *", new Date(2026, 6, 14, 10, 15)), true);
  assert.equal(cronMatches("*/5 * * * *", new Date(2026, 6, 14, 10, 16)), false);
  assert.equal(cronMatches("0 12 1 * 2", new Date(2026, 6, 14, 12, 0)), true);
  for (const invalid of ["* * * *", "60 * * * *", "* 24 * * *", "* * * * * /bin/sh", "@daily", "* * * * *;id"]) assert.throws(() => parseCron(invalid));
});

test("scheduled backups run without a Controller, remain idempotent per minute and persist local results", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-scheduler-")), store = new BackupScheduleStore(root), planId = crypto.randomUUID(), restorePointId = crypto.randomUUID();
  const plan = { id: planId, instanceLocalId: "orders", cron: "* * * * *", retentionCount: 7, enabled: true, version: 1, updatedAt: new Date().toISOString() };
  let backups = 0; const registry = { async get() { return { id: "orders" }; }, async credential() { return { instanceId: "orders" }; } };
  const service = { async create(_instance, _credential, retention) { backups += 1; assert.equal(retention, 7); return { id: restorePointId }; } };
  try {
    service.create = async (_instance, _credential, retention) => { backups += 1; assert.equal(retention, 7); return { id: restorePointId, createdAt: new Date().toISOString(), databaseVersion: "16.9", version: 1, files: [{ sizeBytes: 12 }] }; };
    await store.sync(plan); const executor = new ScheduledBackupExecutor(store, registry, service), now = new Date(2026, 6, 14, 12, 0, 42);
    assert.equal((await executor.runDue(now))[0].status, "succeeded"); assert.deepEqual(await executor.runDue(now), []); assert.equal(backups, 1);
    const results = await store.results(); assert.equal(results[0].result.restorePointId, restorePointId); assert.equal(results[0].scheduledFor, new Date(2026, 6, 14, 12, 0, 0).toISOString());
    await store.acknowledge([results[0].reportId]); assert.deepEqual(await store.results(), []); assert.deepEqual(await executor.runDue(now), []);
    assert.equal((await stat(join(root, "backup-schedules.json"))).mode & 0o777, 0o600);
    await assert.rejects(() => store.sync({ ...plan, version: 1 }), (error) => error.code === "BACKUP_PLAN_VERSION_CONFLICT");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("scheduled backup failures stay local and do not prevent later plans", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-scheduler-")), store = new BackupScheduleStore(root);
  try {
    await store.sync({ id: crypto.randomUUID(), instanceLocalId: "missing", cron: "* * * * *", retentionCount: 7, enabled: true, version: 1, updatedAt: new Date().toISOString() });
    const results = await new ScheduledBackupExecutor(store, { async get() { throw new Error("missing"); } }, {}).runDue(new Date());
    assert.equal(results[0].status, "failed"); assert.equal(results[0].errorCode, "SCHEDULED_BACKUP_FAILED"); assert.equal((await store.results()).length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("scheduler installer writes only fixed systemd or OpenRC cron entrypoints", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-scheduler-install-")), calls = [], runner = { async run(executable, args) { calls.push([executable, args]); return { stdout: "", stderr: "" }; } };
  try {
    const installer = new BackupSchedulerInstaller(runner, root, "/opt/stackpilot-database-helper/current");
    const systemd = await installer.install("ubuntu24.04"), timer = await readFile(systemd.path, "utf8"); assert.match(timer, /OnCalendar=\*-\*-\* \*:\*:00/);
    assert.deepEqual(calls.slice(0, 2), [["systemctl", ["daemon-reload"]], ["systemctl", ["enable", "--now", "stackpilot-database-backups.timer"]]]);
    const alpine = await installer.install("alpine3.22"), cron = await readFile(alpine.path, "utf8"); assert.match(cron, /^\* \* \* \* \* \/usr\/bin\/node \/opt\/stackpilot-database-helper\/current\/apps\/database-helper\/dist\/scheduledBackup\.js # stackpilot-database-backups$/m);
    assert.deepEqual(calls.slice(2), [["rc-update", ["add", "crond", "default"]], ["rc-service", ["crond", "start"]]]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("instance lock prevents backup and restore overlap", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-instance-lock-"));
  try { const release = await acquireInstanceLock(root); await assert.rejects(() => acquireInstanceLock(root), (error) => error.code === "DATABASE_OPERATION_IN_PROGRESS"); await release(); await (await acquireInstanceLock(root))(); }
  finally { await rm(root, { recursive: true, force: true }); }
});

test("instance lock recovers a crashed process owner", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-instance-lock-")), lock = join(root, ".instance-operation.lock");
  try { await mkdir(lock); await writeFile(join(lock, "owner.json"), JSON.stringify({ pid: 2147483647, createdAt: new Date().toISOString() })); await (await acquireInstanceLock(root))(); }
  finally { await rm(root, { recursive: true, force: true }); }
});

test("scheduler lock recovers a crashed process owner", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-scheduler-lock-")), lock = join(root, ".backup-scheduler.lock");
  try { await mkdir(lock); await writeFile(join(lock, "owner.json"), JSON.stringify({ pid: 2147483647, createdAt: new Date().toISOString() })); await (await acquireProcessLock(root, ".backup-scheduler.lock"))(); }
  finally { await rm(root, { recursive: true, force: true }); }
});
