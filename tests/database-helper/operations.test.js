import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseOperationService } from "../../apps/database-helper/dist/operations/operationService.js";
import { OperationJournal } from "../../apps/database-helper/dist/state/operationJournal.js";

const now = () => new Date(Date.now() + 60_000).toISOString();
const operation = (kind, parameters, overrides = {}) => ({ operationId: crypto.randomUUID(), version: 1, kind, parameters: { kind, ...parameters }, idempotencyKey: `${kind}-${crypto.randomUUID()}`, expiresAt: now(), ...overrides });
const instance = { id: "orders", name: "orders", engine: "postgresql", version: "16", port: 5432, managed: false, serviceName: "postgresql@16-main", dataDirectory: "/var/lib/postgresql/16/main", backupDirectory: "/var/lib/stackpilot-database-helper/backups/orders", host: "127.0.0.1", username: "stackpilot", initialDatabase: "postgres", historicalSlowQueriesAvailable: false, createdAt: new Date().toISOString() };
const credential = { instanceId: "orders", username: "stackpilot", password: "this-is-a-long-test-password" };

function service(directory, queryOverrides = {}) {
  const calls = [];
  const registry = { async get(id) { assert.equal(id, "orders"); return instance; }, async credential(id) { assert.equal(id, "orders"); return credential; } };
  const queries = { async query(_instance, _credential, sql) { calls.push(sql); return [{ id: "42", protected: false }]; }, async execute(_instance, _credential, sql) { calls.push(sql); return ""; }, ...queryOverrides };
  const backups = { async create() { calls.push("backup"); } };
  return { calls, value: new DatabaseOperationService(registry, queries, backups, new OperationJournal(join(directory, "journal.json"))) };
}

test("helper governance uses fixed SQL and rejects SQL or session injection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stackpilot-helper-"));
  try {
    const { calls, value } = service(directory);
    assert.equal((await value.execute(operation("explain", { instanceLocalId: "orders", sql: "SELECT * FROM users WHERE id = 1" }))).status, "succeeded");
    assert.match(calls.at(-1), /^BEGIN READ ONLY;/);
    assert.equal((await value.execute(operation("explain", { instanceLocalId: "orders", sql: "SELECT 1; DROP TABLE users" }))).errorCode, "EXPLAIN_SQL_DENIED");
    const invalid = operation("terminate-session", { instanceLocalId: "orders", sessionId: "42;DROP" });
    await assert.rejects(() => value.execute(invalid), (error) => error.name === "ZodError");
    assert.equal((await value.execute(operation("terminate-session", { instanceLocalId: "orders", sessionId: "42" }))).status, "succeeded");
    assert.match(calls.at(-1), /pg_terminate_backend\(42::int\)/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("unmanaged restore and unimplemented install fail structurally without side effects", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stackpilot-helper-"));
  try {
    const { calls, value } = service(directory);
    const restore = await value.execute(operation("restore", { instanceLocalId: "orders", restorePointId: crypto.randomUUID() }));
    assert.equal(restore.errorCode, "RESTORE_UNMANAGED_DENIED"); assert.deepEqual(calls, []);
    const install = await value.execute(operation("install", { engine: "postgresql", name: "newdb", port: null, initialDatabase: "app", credentialPublicKey: "x".repeat(64) }));
    assert.equal(install.errorCode, "INSTALL_REQUIRES_PROVISIONER"); assert.deepEqual(calls, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("operation journal recovers uncertain work and replays terminal results idempotently", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stackpilot-helper-")); const path = join(directory, "journal.json");
  try {
    const pending = operation("set-read-only", { instanceLocalId: "orders" });
    await writeFile(path, JSON.stringify([{ operation: pending, status: "running", update: null, updatedAt: new Date().toISOString() }]));
    const journal = new OperationJournal(path); await journal.load();
    assert.equal((await journal.begin(pending)).errorCode, "HELPER_RESTARTED_DURING_OPERATION");
    const stored = JSON.parse(await readFile(path, "utf8")); assert.equal(stored[0].status, "completed");
    const duplicate = operation("backup", { instanceLocalId: "orders", retentionCount: 7 }, { idempotencyKey: pending.idempotencyKey });
    await assert.rejects(() => journal.begin(duplicate), (error) => error.code === "DUPLICATE_IDEMPOTENCY_KEY");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
