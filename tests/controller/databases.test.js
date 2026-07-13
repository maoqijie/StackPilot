import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { DatabaseSlowQueryService } from "../../apps/controller/dist/modules/databases/databaseSlowQueryService.js";
import { PostgresSlowQueryCollector, normalizeSql } from "../../apps/controller/dist/platform/postgresSlowQueryCollector.js";
import { createControllerServices } from "../../apps/controller/dist/app.js";
import { loadControllerConfig } from "../../apps/controller/dist/config/environment.js";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { IdentityService } from "../../apps/controller/dist/identity/identityService.js";
import { DatabaseMonitoringService, publicDatabaseId } from "../../apps/controller/dist/modules/databases/databaseMonitoringService.js";
import { MemoryAgentControlRepository } from "../../apps/controller/dist/repositories/agentControlRepository.js";
import { createStackPilotServer } from "../../apps/controller/dist/server.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";

const current = "2026-07-14T00:00:00.000Z";
const node = (nodeId, nodeName, collectedAt = new Date().toISOString()) => ({
  nodeId, nodeName, status: "online", agentVersion: "0.2.0", protocolVersion: "1.0", platform: "linux",
  declaredCapabilities: ["databases.inventory.read"], allowedCapabilities: ["databases.inventory.read"], enrolledAt: current, lastSeenAt: collectedAt, revokedAt: null,
  telemetry: { collectedAt, hostname: nodeName, primaryIp: "10.0.0.8", cpu: null, memory: null, loadAverage: null, disks: [], uptimeSeconds: 1 },
  databaseSnapshot: { collectedAt, collectionStatus: "complete", warnings: [], instances: [{ id: "postgresql.service", name: "postgresql", engine: "postgresql", version: null, host: nodeName, port: null, status: "running", source: "systemd:postgresql.service", latencyMs: null, storageBytes: null, activeConnections: null, maxConnections: null, slowQueryCount: null, backupStatus: "unavailable", lastBackupAt: null, accessMode: "unknown", owner: null, region: null, autoBackup: null, remoteAccess: null }] },
});

test("database monitoring respects node scope and emits stable public ids", async () => {
  const repository = new MemoryAgentControlRepository();
  const firstId = "11111111-1111-4111-8111-111111111111"; const secondId = "22222222-2222-4222-8222-222222222222";
  await repository.update((state) => state.nodes.push(node(firstId, "db-a"), node(secondId, "db-b")));
  const service = new DatabaseMonitoringService(repository);
  const scoped = await service.getInstances({ nodeScope: [firstId] });
  assert.equal(scoped.instances.length, 1); assert.equal(scoped.instances[0].nodeName, "db-a");
  assert.equal(scoped.instances[0].id, publicDatabaseId(firstId, "postgresql.service"));
  assert.equal(scoped.instances[0].address, "10.0.0.8"); assert.equal(scoped.instances[0].port, null);
  assert.equal((await service.getInstances({ nodeScope: "all" })).instances.length, 2);
});

test("database monitoring includes cached Controller-local systemd inventory independently of Agent scope", async () => {
  const repository = new MemoryAgentControlRepository();
  let calls = 0;
  const localSnapshot = {
    collectedAt: new Date().toISOString(),
    collectionStatus: "complete",
    warnings: [],
    instances: [{ ...node("11111111-1111-4111-8111-111111111111", "unused").databaseSnapshot.instances[0], host: "controller-db", status: "running" }],
  };
  const service = new DatabaseMonitoringService(repository, { collect: async () => { calls += 1; return localSnapshot; } }, 60_000);

  const first = await service.getInstances({ nodeScope: "all" });
  const second = await service.getInstances({ nodeScope: "all" });
  assert.equal(calls, 1);
  assert.equal(first.collectionStatus, "complete");
  assert.equal(first.instances.length, 1);
  assert.equal(first.instances[0].nodeId, "node-local");
  assert.equal(first.instances[0].nodeName, "controller-db");
  assert.equal(first.instances[0].id, publicDatabaseId("node-local", "postgresql.service"));
  assert.deepEqual(second, first);

  const scoped = await service.getInstances({ nodeScope: [] });
  assert.equal(calls, 1);
  assert.deepEqual(scoped.instances, first.instances);
  assert.equal(scoped.collectionStatus, "complete");
});

test("database monitoring retains the last local inventory after a transient collection failure", async () => {
  const repository = new MemoryAgentControlRepository();
  let calls = 0;
  const instance = node("11111111-1111-4111-8111-111111111111", "unused").databaseSnapshot.instances[0];
  const service = new DatabaseMonitoringService(repository, {
    collect: async () => calls++ === 0
      ? { collectedAt: current, collectionStatus: "complete", warnings: [], instances: [instance] }
      : { collectedAt: "2026-07-14T00:01:00.000Z", collectionStatus: "unavailable", warnings: ["systemd 数据库服务清单不可用"], instances: [] },
  }, 0);

  await service.getInstances({ nodeScope: "all" });
  const retained = await service.getInstances({ nodeScope: "all" });
  assert.equal(retained.instances.length, 1);
  assert.equal(retained.collectionStatus, "partial");
  assert.match(retained.warnings.join(" "), /保留 Controller 本机上次成功采集/);
});

test("database monitoring labels stale data and an empty authorized scope honestly", async () => {
  const repository = new MemoryAgentControlRepository(); const id = "11111111-1111-4111-8111-111111111111";
  await repository.update((state) => state.nodes.push(node(id, "db-stale", new Date(Date.now() - 180_000).toISOString())));
  const stale = await new DatabaseMonitoringService(repository).getInstances({ nodeScope: "all" });
  assert.equal(stale.collectionStatus, "partial"); assert.equal(stale.instances[0].freshness, "stale"); assert.match(stale.warnings[0], /已过期/);
  const empty = await new DatabaseMonitoringService(repository).getInstances({ nodeScope: [] });
  assert.equal(empty.collectionStatus, "unavailable"); assert.deepEqual(empty.instances, []); assert.match(empty.warnings[0], /尚未上报/);
});

test("database monitoring reports legacy agents, future timestamps and bounded large inventories", async () => {
  const repository = new MemoryAgentControlRepository();
  const currentNode = node("11111111-1111-4111-8111-111111111111", "db-current");
  const legacyNode = { ...node("22222222-2222-4222-8222-222222222222", "db-legacy"), databaseSnapshot: undefined };
  const futureNode = node("33333333-3333-4333-8333-333333333333", "db-future", new Date(Date.now() + 60_000).toISOString());
  const instance = currentNode.databaseSnapshot.instances[0];
  currentNode.databaseSnapshot.instances = Array.from({ length: 256 }, (_, index) => ({ ...instance, id: `postgresql-${index}.service`, name: `postgresql-${index}` }));
  await repository.update((state) => state.nodes.push(currentNode, legacyNode, futureNode));
  const payload = await new DatabaseMonitoringService(repository).getInstances({ nodeScope: "all" });
  assert.equal(payload.collectionStatus, "partial");
  assert.match(payload.warnings.join(" "), /尚未上报/);
  assert.equal(payload.instances.find((record) => record.nodeName === "db-future").freshness, "stale");
  assert.equal(payload.instances.length, 257);

  await repository.update((state) => {
    state.nodes = Array.from({ length: 40 }, (_, nodeIndex) => {
      const next = node(`${String(nodeIndex + 1).padStart(8, "0")}-1111-4111-8111-111111111111`, `db-${nodeIndex}`);
      next.databaseSnapshot.instances = Array.from({ length: 256 }, (_, instanceIndex) => ({ ...instance, id: `postgresql-${instanceIndex}.service`, name: `postgresql-${instanceIndex}` }));
      return next;
    });
  });
  const bounded = await new DatabaseMonitoringService(repository).getInstances({ nodeScope: "all" });
  assert.equal(bounded.instances.length, 10_000);
  assert.equal(bounded.collectionStatus, "partial"); assert.match(bounded.warnings[0], /响应已截断/);
});

test("GET /api/databases enforces read permission and principal node scope", async () => {
  const databaseStore = openDatabase(":memory:"); const identity = new IdentityService(databaseStore, Buffer.alloc(32, 9));
  await identity.createInitialAdministrator("admin", "Administrator", "correct horse battery staple");
  const admin = (await identity.login("admin", "correct horse battery staple", "test", "ua")).principal;
  const repository = new MemoryAgentControlRepository(); const firstId = "11111111-1111-4111-8111-111111111111"; const secondId = "22222222-2222-4222-8222-222222222222";
  await repository.update((state) => state.nodes.push(node(firstId, "db-a"), node(secondId, "db-b")));
  const services = createControllerServices(new FakePlatformAdapter(), process.cwd(), loadControllerConfig({}), repository);
  const noPermission = identity.createApiToken(admin, { name: "nodes", permissions: ["nodes:read"], nodeScope: "all", expiresAt: null }).token;
  const scoped = identity.createApiToken(admin, { name: "database", permissions: ["databases:read"], nodeScope: [firstId], expiresAt: null }).token;
  const server = createStackPilotServer({ env: { STACKPILOT_COOKIE_SECURE: "0" }, services, database: databaseStore, identity });
  server.listen(0, "127.0.0.1"); await once(server, "listening"); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/databases`)).status, 401);
    assert.equal((await fetch(`${base}/api/databases`, { headers: { Authorization: `Bearer ${noPermission}` } })).status, 403);
    const response = await fetch(`${base}/api/databases`, { headers: { Authorization: `Bearer ${scoped}` } });
    assert.equal(response.status, 200); const payload = await response.json(); assert.deepEqual(payload.instances.map((instance) => instance.nodeId), [firstId]);
  } finally { server.close(); await once(server, "close"); databaseStore.close(); }
});

const now = "2026-07-14T00:00:00.000Z";
const snapshot = {
  version: "16.9", port: 5432, databases: [{ name: "orders", connections: 4 }],
  queries: [{ pid: 91, database: "orders", owner: "reporter", sql: "SELECT * FROM users WHERE email = 'private@example.com' AND id = 42", durationMs: 31_250, startedAt: now, queryId: "-123", waitEventType: null, waitEvent: null }],
};

test("PostgreSQL collector normalizes literals and returns real activity fields", async () => {
  const calls = [];
  const collector = new PostgresSlowQueryCollector(async (executable, args, options) => {
    calls.push({ executable, args, options });
    return { ok: true, stdout: JSON.stringify(snapshot), stderr: "", elapsedMs: 1 };
  });
  const payload = await collector.collect();
  assert.equal(payload.collectionStatus, "complete");
  assert.equal(payload.instances[0].activeConnections, 4);
  assert.equal(payload.instances[0].slowQueryCount, 1);
  assert.equal(payload.queries[0].durationMs, 31_250);
  assert.equal(payload.queries[0].risk, "high");
  assert.equal(payload.queries[0].p95Ms, null);
  assert.equal(payload.queries[0].calls, null);
  assert.doesNotMatch(payload.queries[0].sql, /private@example|42/);
  assert.equal(calls[0].executable, "/usr/bin/psql");
  assert.equal(calls[0].options.timeoutMs, 3_000);
  assert.ok(calls[0].args.includes("ON_ERROR_STOP=1"));
});

test("PostgreSQL collector reports unavailable without leaking command errors", async () => {
  const collector = new PostgresSlowQueryCollector(async () => ({ ok: false, stdout: "", stderr: "password=secret", elapsedMs: 1 }));
  const payload = await collector.collect();
  assert.equal(payload.collectionStatus, "unavailable");
  assert.deepEqual(payload.instances, []);
  assert.doesNotMatch(JSON.stringify(payload), /secret/);
});

test("slow-query service deduplicates and caches collection", async () => {
  let calls = 0;
  const payload = { collectedAt: now, collectionStatus: "complete", warnings: [], thresholdMs: 1_000, instances: [], queries: [] };
  const service = new DatabaseSlowQueryService({ collect: async () => { calls += 1; return payload; } }, 60_000);
  const [first, second] = await Promise.all([service.getSlowQueries(), service.getSlowQueries()]);
  assert.equal(first, payload); assert.equal(second, payload); await service.getSlowQueries(); assert.equal(calls, 1);
});

test("slow-query API requires database read permission", async () => {
  const database = openDatabase(":memory:"); const identity = new IdentityService(database, Buffer.alloc(32, 4));
  await identity.createInitialAdministrator("admin", "Administrator", "correct horse battery staple");
  const admin = (await identity.login("admin", "correct horse battery staple", "test", "ua")).principal;
  const services = createControllerServices(new FakePlatformAdapter(), process.cwd(), loadControllerConfig({}), new MemoryAgentControlRepository());
  services.databaseSlowQueries = new DatabaseSlowQueryService({ collect: async () => ({ collectedAt: now, collectionStatus: "complete", warnings: [], thresholdMs: 1_000, instances: [], queries: [] }) });
  const readToken = identity.createApiToken(admin, { name: "read", permissions: ["databases:read"], nodeScope: [], expiresAt: null }).token;
  const deniedToken = identity.createApiToken(admin, { name: "denied", permissions: ["overview:read"], nodeScope: [], expiresAt: null }).token;
  const server = createStackPilotServer({ env: { STACKPILOT_COOKIE_SECURE: "0" }, services, database, identity });
  server.listen(0, "127.0.0.1"); await once(server, "listening"); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/databases/slow-queries`)).status, 401);
    assert.equal((await fetch(`${base}/api/databases/slow-queries`, { headers: { Authorization: `Bearer ${deniedToken}` } })).status, 403);
    const response = await fetch(`${base}/api/databases/slow-queries`, { headers: { Authorization: `Bearer ${readToken}` } });
    assert.equal(response.status, 200); assert.equal((await response.json()).collectionStatus, "complete");
  } finally { server.close(); await once(server, "close"); database.close(); }
});

test("SQL normalization removes common literal and comment forms", () => {
  assert.equal(normalizeSql("SELECT 123, 4.5, 'secret', $$hidden$$ /* token abc */ -- password xyz"), "SELECT ?, ?, '?', $tag$?$tag$");
});
