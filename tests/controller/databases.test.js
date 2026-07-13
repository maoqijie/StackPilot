import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
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

test("database monitoring labels stale data and an empty authorized scope honestly", async () => {
  const repository = new MemoryAgentControlRepository(); const id = "11111111-1111-4111-8111-111111111111";
  await repository.update((state) => state.nodes.push(node(id, "db-stale", new Date(Date.now() - 180_000).toISOString())));
  const stale = await new DatabaseMonitoringService(repository).getInstances({ nodeScope: "all" });
  assert.equal(stale.collectionStatus, "partial"); assert.equal(stale.instances[0].freshness, "stale"); assert.match(stale.warnings[0], /已过期/);
  const empty = await new DatabaseMonitoringService(repository).getInstances({ nodeScope: [] });
  assert.equal(empty.collectionStatus, "unavailable"); assert.deepEqual(empty.instances, []); assert.match(empty.warnings[0], /尚未上报/);
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
