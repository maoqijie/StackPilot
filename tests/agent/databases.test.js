import assert from "node:assert/strict";
import test from "node:test";
import { boundQueryUpload, DatabaseAgentRuntime } from "../../apps/agent/dist/databases/runtime.js";
import { MemoryDatabaseOperationOutbox } from "../../apps/agent/dist/databases/operationOutbox.js";
import { DatabaseSnapshotCache, SystemdDatabaseCollector, parseSystemdDatabaseUnits } from "../../packages/host-telemetry/dist/index.js";

const identity = { nodeId: "11111111-1111-4111-8111-111111111111", credentialId: "22222222-2222-4222-8222-222222222222", privateKey: "unused", publicKey: "unused", protocolVersion: "1.1", createdAt: new Date().toISOString() };
const collection = { snapshot: { collectedAt: new Date().toISOString(), collectionStatus: "complete", warnings: [], instances: [] }, queryUpload: { collectedAt: new Date().toISOString(), collectionStatus: "complete", warnings: [], sessions: [], queries: [] } };

test("database collection is single-flight and uploads snapshot and SQL separately", async () => {
  const paths = []; let resolveHelper; let calls = 0;
  const helper = { request() { calls += 1; return new Promise((resolve) => { resolveHelper = resolve; }); } };
  const controller = { async json(path) { paths.push(path); return {}; } };
  const runtime = new DatabaseAgentRuntime(helper, controller, identity, 60_000);
  const first = runtime.collectIfDue(1_000); const overlapping = runtime.collectIfDue(1_000); assert.equal(calls, 1);
  resolveHelper({ ok: true, result: collection }); await Promise.all([first, overlapping]);
  assert.deepEqual(paths, ["/api/agent/databases/snapshot", "/api/agent/databases/queries"]);
  await runtime.collectIfDue(10_000); assert.equal(calls, 1);
});

test("database runtime waits for Controller feature negotiation before using helper endpoints", async () => {
  let helperCalls = 0;
  const runtime = new DatabaseAgentRuntime(
    { async request() { helperCalls += 1; return { ok: true, result: collection }; } },
    { async json() { return {}; } }, identity, 60_000, new MemoryDatabaseOperationOutbox(), () => false,
  );
  await runtime.runCycle(); assert.equal(helperCalls, 0);
});

test("terminal operation update survives delivery failure and is replayed before new work", async () => {
  const operation = { operationId: crypto.randomUUID(), version: 1, kind: "set-read-only", parameters: { kind: "set-read-only", instanceLocalId: "orders" }, idempotencyKey: "readonly-replay", expiresAt: new Date(Date.now() + 60_000).toISOString() };
  const terminal = { operationId: operation.operationId, version: 1, status: "succeeded", errorCode: null, errorMessage: null, credentialEnvelope: null, result: null, updatedAt: new Date().toISOString() };
  const outbox = new MemoryDatabaseOperationOutbox(); let statusCalls = 0;
  const firstController = { async json(path) { if (path.endsWith("/poll")) return { operations: [operation], controllerTime: new Date().toISOString() }; if (path.endsWith("/status") && ++statusCalls === 1) throw new Error("network lost"); return {}; } };
  const helper = { async request() { return { ok: true, result: terminal }; } };
  await new DatabaseAgentRuntime(helper, firstController, identity, 60_000, outbox).processOperations();
  assert.deepEqual(await outbox.pending(), [terminal]);
  const delivered = []; const secondController = { async json(path, body) { if (path.endsWith("/status")) delivered.push(body); if (path.endsWith("/poll")) return { operations: [], controllerTime: new Date().toISOString() }; return {}; } };
  await new DatabaseAgentRuntime(helper, secondController, identity, 60_000, outbox).processOperations();
  assert.deepEqual(delivered, [terminal]); assert.deepEqual(await outbox.pending(), []);
});

test("complete SQL upload is deterministically bounded without moving it into heartbeat", () => {
  const queries = Array.from({ length: 100 }, (_, index) => ({ id: `q-${index}`, instanceLocalId: "orders", database: "app", fingerprint: `fp-${index}`, sql: `SELECT '${"x".repeat(1_900)}'`, durationMs: 1_000, calls: null, p95Ms: null, rowsExamined: null, risk: "low", state: "active", owner: "app", startedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), sessionId: String(index + 1), waitEvent: null, historical: false }));
  const upload = { collectedAt: new Date().toISOString(), collectionStatus: "complete", warnings: [], sessions: [], queries };
  const bounded = boundQueryUpload(upload, 32 * 1024);
  assert.ok(Buffer.byteLength(JSON.stringify(bounded)) <= 32 * 1024); assert.ok(bounded.queries.length > 0); assert.ok(bounded.queries.length < queries.length);
  assert.equal(bounded.collectionStatus, "partial"); assert.match(bounded.warnings.at(-1), /传输上限/);
});

test("operation polling forwards the Controller running version and reports only terminal state", async () => {
  const operation = { operationId: crypto.randomUUID(), version: 1, kind: "set-read-only", parameters: { kind: "set-read-only", instanceLocalId: "orders" }, idempotencyKey: "readonly-orders", expiresAt: new Date(Date.now() + 60_000).toISOString() };
  const statuses = [];
  const controller = { async json(path, body) {
    if (path.endsWith("/poll")) return { operations: [operation], controllerTime: new Date().toISOString() };
    if (path.endsWith("/status")) statuses.push(body); return {};
  } };
  const helper = { async request(request) { assert.deepEqual(request, { action: "execute", operation }); return { ok: true, result: { operationId: operation.operationId, version: 1, status: "succeeded", errorCode: null, errorMessage: null, credentialEnvelope: null, updatedAt: new Date().toISOString() } }; } };
  await new DatabaseAgentRuntime(helper, controller, identity).processOperations();
  assert.deepEqual(statuses.map((status) => status.status), ["succeeded"]);
  assert.deepEqual(statuses.map((status) => status.version), [1]);
});

test("database inventory parses fixed PostgreSQL, MySQL and MariaDB systemd services", () => {
  const output = [
    "postgresql.service loaded active running PostgreSQL",
    "postgresql@16-main.service loaded active running PostgreSQL cluster",
    "mysql.service loaded failed failed MySQL",
    "mariadb.service loaded inactive dead MariaDB",
    "nginx.service loaded active running Nginx",
  ].join("\n");
  const instances = parseSystemdDatabaseUnits(output, "db-node-01");
  assert.deepEqual(instances.map(({ name, engine, status }) => ({ name, engine, status })), [
    { name: "postgresql-16-main", engine: "postgresql", status: "running" },
    { name: "mysql", engine: "mysql", status: "degraded" },
    { name: "mariadb", engine: "mariadb", status: "stopped" },
  ]);
  assert.ok(instances.every((instance) => instance.port === null && instance.storageBytes === null && instance.backupStatus === "unavailable"));
});

test("database inventory keeps the PostgreSQL umbrella unit when no cluster unit exists", () => {
  const instances = parseSystemdDatabaseUnits("postgresql.service loaded active exited PostgreSQL", "db-node-01");
  assert.equal(instances.length, 1);
  assert.equal(instances[0].name, "postgresql");
  assert.equal(instances[0].status, "unknown");
});

test("database inventory reports unsupported and failed collection without fixtures", async () => {
  const now = () => new Date("2026-07-14T00:00:00.000Z");
  const unsupported = await new SystemdDatabaseCollector({ target: "darwin", now }).collect();
  assert.equal(unsupported.collectionStatus, "unavailable"); assert.deepEqual(unsupported.instances, []);
  const failed = await new SystemdDatabaseCollector({ target: "linux", now, run: async () => { throw new Error("systemd unavailable"); } }).collect();
  assert.equal(failed.collectionStatus, "unavailable"); assert.deepEqual(failed.instances, []);
});

test("database inventory cache prevents overlap and enforces the collection interval", async () => {
  let calls = 0; let release;
  const collector = { collect: async () => { calls += 1; await new Promise((resolve) => { release = resolve; }); return { collectedAt: new Date().toISOString(), collectionStatus: "complete", warnings: [], instances: [] }; } };
  const cache = new DatabaseSnapshotCache(collector, 60_000);
  const first = cache.refreshIfDue(100_000); const second = cache.refreshIfDue(100_001);
  assert.equal(calls, 1); release(); await Promise.all([first, second]);
  await cache.refreshIfDue(159_999); assert.equal(calls, 1);
});

test("database inventory cache retains the last successful instances after a transient failure", async () => {
  let calls = 0;
  const instance = parseSystemdDatabaseUnits("postgresql.service loaded active running PostgreSQL", "db-node")[0];
  const collector = { collect: async () => calls++ === 0
    ? { collectedAt: "2026-07-14T00:00:00.000Z", collectionStatus: "complete", warnings: [], instances: [instance] }
    : { collectedAt: "2026-07-14T00:01:00.000Z", collectionStatus: "unavailable", warnings: ["systemd 不可用"], instances: [] } };
  const cache = new DatabaseSnapshotCache(collector, 60_000);
  await cache.refreshIfDue(100_000); await cache.refreshIfDue(160_000);
  assert.equal(cache.current.collectionStatus, "partial"); assert.equal(cache.current.instances.length, 1);
  assert.equal(cache.current.collectedAt, "2026-07-14T00:00:00.000Z");
  assert.match(cache.current.warnings.join(" "), /保留上次成功/);
});
