import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cleanupExpiredRollbackCopies, DatabaseRestoreService } from "../../apps/database-helper/dist/operations/restore.js";

const checksum = (value) => createHash("sha256").update(value).digest("hex");

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-restore-")), point = randomUUID();
  const instance = { id: "orders", name: "orders", engine: "postgresql", version: "16", port: 5432, managed: true, serviceName: "stackpilot-postgresql-orders", dataDirectory: join(root, "instance/data"), backupDirectory: join(root, "backups"), host: "127.0.0.1", username: "stackpilot", initialDatabase: "app", historicalSlowQueriesAvailable: true, createdAt: new Date().toISOString(), operatingSystem: "ubuntu24.04", configDirectory: join(root, "instance/config"), runtimeDirectory: join(root, "instance/run"), toolFamily: "postgresql" };
  const credential = { instanceId: "orders", username: "stackpilot", password: "this-is-a-long-test-password", initialUsername: "app_user", initialPassword: "another-long-test-password" };
  await mkdir(instance.dataDirectory, { recursive: true }); await mkdir(instance.configDirectory, { recursive: true }); await writeFile(join(instance.dataDirectory, "old-data"), "old"); await writeFile(join(instance.configDirectory, "postgresql.conf"), "config");
  const directory = join(instance.backupDirectory, point); await mkdir(directory, { recursive: true });
  const globals = "CREATE ROLE backup;", dump = "custom-dump"; await writeFile(join(directory, "globals.sql"), globals); await writeFile(join(directory, "database-YXBw.dump"), dump);
  const manifest = { version: 1, id: point, instanceId: "orders", engine: "postgresql", databaseVersion: "16", createdAt: new Date().toISOString(), files: [
    { name: "globals.sql", sizeBytes: Buffer.byteLength(globals), sha256: checksum(globals), databaseName: null },
    { name: "database-YXBw.dump", sizeBytes: Buffer.byteLength(dump), sha256: checksum(dump), databaseName: "app" },
  ] }; await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
  const calls = [], runner = { async run(executable, args, options = {}) { calls.push({ executable, args, options }); return { stdout: "", stderr: "" }; } };
  const queries = { async execute(_instance, _credential, sql) { calls.push({ executable: "query", args: [sql] }); return ""; } };
  const provisioner = { platform() { return {}; }, async identity() { return { uid: process.getuid?.() ?? 501, gid: process.getgid?.() ?? 20 }; }, async stop() { calls.push({ executable: "stop", args: [] }); }, async initialize(_instance, _plan, _identity, admin) { assert.equal(admin, "stackpilot_restore_admin"); calls.push({ executable: "initialize", args: [] }); await writeFile(join(instance.dataDirectory, "new-data"), "new"); }, async start() { calls.push({ executable: "start", args: [] }); }, async waitReady() {}, async health() {} };
  return { root, point, instance, credential, calls, runner, queries, provisioner, directory };
}

test("restore verifies manifest, keeps a 24 hour rollback copy and returns health metadata", async () => {
  const value = await fixture();
  try {
    const result = await new DatabaseRestoreService(value.runner, value.queries, value.provisioner).restore(value.instance, value.credential, value.point);
    assert.equal(result.recoveryPointId, value.point); assert.equal(result.healthy, true); assert.ok(Date.parse(result.rollbackExpiresAt) > Date.now());
    const rollbacks = await readdir(join(value.root, "instance/rollbacks")); assert.equal(rollbacks.length, 1);
    assert.equal(await readFile(join(value.root, "instance/rollbacks", rollbacks[0], "data/old-data"), "utf8"), "old");
    assert.ok(value.calls.some((call) => call.executable === "pg_restore"));
    assert.equal(value.calls.find((call) => call.executable === "psql").options.inputPath, join(value.directory, "globals.sql"));
    assert.ok(value.calls.some((call) => call.executable === "query" && call.args[0] === 'DROP ROLE "stackpilot_restore_admin"'));
  } finally { await rm(value.root, { recursive: true, force: true }); }
});

test("restore rejects checksum changes before stopping the service", async () => {
  const value = await fixture();
  try {
    await writeFile(join(value.directory, "globals.sql"), "tampered");
    await assert.rejects(() => new DatabaseRestoreService(value.runner, value.queries, value.provisioner).restore(value.instance, value.credential, value.point), (error) => error.code === "RESTORE_CHECKSUM_MISMATCH");
    assert.equal(value.calls.some((call) => call.executable === "stop"), false); assert.equal((await stat(join(value.instance.dataDirectory, "old-data"))).isFile(), true);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});

test("restore rejects unmanaged instances before reading a restore point or stopping a service", async () => {
  const value = await fixture(); value.instance.managed = false;
  try {
    await assert.rejects(() => new DatabaseRestoreService(value.runner, value.queries, value.provisioner).restore(value.instance, value.credential, value.point), (error) => error.code === "RESTORE_UNMANAGED_DENIED");
    assert.deepEqual(value.calls, []);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});

test("restore rolls the original data directory back when the new instance fails health checks", async () => {
  const value = await fixture(); value.provisioner.health = async () => { throw new Error("unhealthy"); };
  try {
    await assert.rejects(() => new DatabaseRestoreService(value.runner, value.queries, value.provisioner).restore(value.instance, value.credential, value.point), /unhealthy/);
    assert.equal(await readFile(join(value.instance.dataDirectory, "old-data"), "utf8"), "old");
    assert.equal(value.calls.filter((call) => call.executable === "start").length, 2);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});

test("restore restarts the original service when moving the data directory fails after stop", async () => {
  const value = await fixture(); await rm(value.instance.dataDirectory, { recursive: true, force: true });
  try {
    await assert.rejects(() => new DatabaseRestoreService(value.runner, value.queries, value.provisioner).restore(value.instance, value.credential, value.point), (error) => error.code === "ENOENT");
    assert.equal(value.calls.filter((call) => call.executable === "stop").length, 2); assert.equal(value.calls.filter((call) => call.executable === "start").length, 1);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});

test("expired rollback copies are removed while unknown directories remain untouched", async () => {
  const value = await fixture(), root = join(value.root, "instance/rollbacks"), expired = join(root, "20260713000000000"), unknown = join(root, "20260713000000001");
  try {
    await mkdir(expired, { recursive: true }); await mkdir(unknown, { recursive: true });
    await writeFile(join(expired, "rollback.json"), JSON.stringify({ instanceId: "orders", restorePointId: value.point, createdAt: "2026-07-12T00:00:00.000Z", expiresAt: "2026-07-13T00:00:00.000Z" }));
    await writeFile(join(unknown, "rollback.json"), "invalid");
    assert.equal(await cleanupExpiredRollbackCopies([value.instance], new Date("2026-07-14T00:00:00.000Z")), 1);
    await assert.rejects(() => stat(expired), (error) => error.code === "ENOENT"); assert.equal((await stat(unknown)).isDirectory(), true);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});
