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
  const queries = { async query(_instance, _credential, sql) { calls.push(sql); return [{ id: "42", protected: false }]; }, async execute(_instance, _credential, sql) { calls.push(sql); return "[{\"Plan\":{\"Node Type\":\"Seq Scan\"}}]"; }, ...queryOverrides };
  const backups = { async create() { calls.push("backup"); return { version: 1, id: crypto.randomUUID(), instanceId: "orders", engine: "postgresql", databaseVersion: "16", createdAt: new Date().toISOString(), files: [{ name: "globals.sql", sizeBytes: 12, sha256: "a".repeat(64), databaseName: null }] }; } };
  const provisioner = { async install(parameters) { calls.push(["install", parameters.name]); return { credentialEnvelope: { algorithm: "RSA-OAEP-256", ciphertext: "encrypted", expiresAt: new Date(Date.now() + 60_000).toISOString() }, result: { localInstanceId: parameters.name, engine: parameters.engine, port: 5433, serviceName: `stackpilot-${parameters.engine}-${parameters.name}` } }; } };
  const restores = { async restore(_instance, _credential, restorePointId) { calls.push(["restore", restorePointId]); return { recoveryPointId: restorePointId, healthy: true, rollbackExpiresAt: new Date(Date.now() + 60_000).toISOString() }; } };
  return { calls, value: new DatabaseOperationService(registry, queries, backups, new OperationJournal(join(directory, "journal.json")), provisioner, restores) };
}

test("helper governance uses fixed SQL and rejects SQL or session injection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stackpilot-helper-"));
  try {
    const { calls, value } = service(directory);
    assert.equal((await value.execute(operation("explain", { instanceLocalId: "orders", sql: "SELECT * FROM users WHERE id = 1" }))).status, "succeeded");
    const explain = await value.execute(operation("explain", { instanceLocalId: "orders", sql: "SELECT * FROM users WHERE id = 2" })); assert.equal(explain.result.kind, "explain"); assert.equal(explain.result.format, "json");
    assert.match(calls.at(-1), /^BEGIN READ ONLY;/);
    assert.equal((await value.execute(operation("explain", { instanceLocalId: "orders", sql: "SELECT 1; DROP TABLE users" }))).errorCode, "EXPLAIN_SQL_DENIED");
    const invalid = operation("terminate-session", { instanceLocalId: "orders", sessionId: "42;DROP" });
    await assert.rejects(() => value.execute(invalid), (error) => error.name === "ZodError");
    assert.equal((await value.execute(operation("terminate-session", { instanceLocalId: "orders", sessionId: "42" }))).status, "succeeded");
    assert.match(calls.at(-1), /pg_terminate_backend\(42::int\)/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("install returns credentials and a structured instance result", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stackpilot-helper-"));
  try {
    const { calls, value } = service(directory);
    const install = await value.execute(operation("install", { engine: "postgresql", name: "newdb", port: null, initialDatabase: "app", credentialPublicKey: "x".repeat(64) }));
    assert.equal(install.status, "succeeded"); assert.equal(install.result.kind, "install"); assert.equal(install.result.instanceLocalId, "newdb");
    assert.equal(install.credentialEnvelope.algorithm, "RSA-OAEP-256"); assert.deepEqual(calls, [["install", "newdb"]]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("backup returns a structured recovery point result", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stackpilot-helper-"));
  try {
    const { value } = service(directory); const update = await value.execute(operation("backup", { instanceLocalId: "orders", retentionCount: 7 }));
    assert.equal(update.status, "succeeded"); assert.equal(update.result.kind, "backup"); assert.equal(update.result.sizeBytes, 12);
    assert.match(update.result.checksum, /^[a-f0-9]{64}$/); assert.equal(update.result.databaseVersion, "16");
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
