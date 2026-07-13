import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseBackupService } from "../../apps/database-helper/dist/operations/backup.js";

const credential = { instanceId: "orders", username: "stackpilot", password: "this-is-a-long-test-password" };

test("logical backup performs capacity preflight, writes checksum manifest and never exposes password in arguments", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-backup-"));
  const instance = { id: "orders", name: "orders", engine: "postgresql", version: "16", port: 5432, managed: true, serviceName: "stackpilot-postgresql-orders", dataDirectory: join(root, "data"), backupDirectory: join(root, "backups"), host: "127.0.0.1", username: "stackpilot", initialDatabase: "postgres", historicalSlowQueriesAvailable: true, createdAt: new Date().toISOString() };
  const calls = [];
  const runner = { async run(executable, args, options = {}) {
    calls.push({ executable, args, options });
    if (executable === "df") return { stdout: "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/test 10000000 1 9000000 1% /tmp", stderr: "" };
    if (options.outputPath) await writeFile(options.outputPath, `dump:${executable}`);
    return { stdout: "", stderr: "" };
  } };
  const queries = { async query(_instance, _credential, sql) { return sql.includes("pg_database_size") ? { storageBytes: 1024 } : ["postgres", "orders"]; } };
  try {
    const manifest = await new DatabaseBackupService(runner, queries).create(instance, credential, 7);
    assert.equal(manifest.files.length, 3); assert.ok(manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)));
    const disk = JSON.parse(await readFile(join(instance.backupDirectory, manifest.id, "manifest.json"), "utf8")); assert.deepEqual(disk, manifest);
    for (const call of calls) {
      assert.equal(call.args.includes(credential.password), false);
      if (call.executable !== "df") assert.equal(call.options.credentialEnvironment?.PGPASSWORD, credential.password);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("capacity rejection leaves no partial restore point", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-backup-"));
  const instance = { id: "orders", name: "orders", engine: "mysql", version: "8.4", port: 3306, managed: true, serviceName: "stackpilot-mysql-orders", dataDirectory: join(root, "data"), backupDirectory: join(root, "backups"), host: "127.0.0.1", username: "stackpilot", initialDatabase: "mysql", historicalSlowQueriesAvailable: true, createdAt: new Date().toISOString() };
  const runner = { async run() { return { stdout: "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/test 100 99 1 99% /tmp", stderr: "" }; } };
  const queries = { async query() { return { storageBytes: 1024 * 1024 * 1024 }; } };
  try {
    await assert.rejects(() => new DatabaseBackupService(runner, queries).create(instance, credential, 7), (error) => error.code === "INSUFFICIENT_CAPACITY");
    assert.deepEqual(await readdir(instance.backupDirectory), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
