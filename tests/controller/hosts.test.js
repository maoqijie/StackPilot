import assert from "node:assert/strict";
import crypto from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import { createControllerServices } from "../../apps/controller/dist/app.js";
import { loadControllerConfig } from "../../apps/controller/dist/config/environment.js";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { HostMonitoringService } from "../../apps/controller/dist/modules/hosts/hostMonitoringService.js";
import { NodeService } from "../../apps/controller/dist/modules/nodes/nodeService.js";
import { MemoryAgentControlRepository } from "../../apps/controller/dist/repositories/agentControlRepository.js";
import { SqliteAgentControlRepository } from "../../apps/controller/dist/repositories/sqliteAgentControlRepository.js";
import { IdentityService } from "../../apps/controller/dist/identity/identityService.js";
import { createStackPilotServer } from "../../apps/controller/dist/server.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";

const nodeId = "11111111-1111-4111-8111-111111111111";
const otherNodeId = "22222222-2222-4222-8222-222222222222";
const now = () => new Date().toISOString();
const node = (id, status = "online") => ({ nodeId: id, nodeName: `agent-${id[0]}`, status, agentVersion: "0.2.0", protocolVersion: "1.0", platform: "linux", declaredCapabilities: ["system.summary.read"], allowedCapabilities: ["system.summary.read"], enrolledAt: now(), lastSeenAt: status === "pending" ? null : now(), revokedAt: null });
const telemetry = () => ({
  collectedAt: now(), hostname: "remote-host", primaryIp: "10.0.0.8",
  cpu: { usagePercent: 20, coreUsagePercents: [20] }, memory: { totalBytes: 1000, availableBytes: 400 },
  loadAverage: [0.1, 0.2, 0.3], disks: [{ label: "root", mount: "/", totalBytes: 1000, usedBytes: 700 }], uptimeSeconds: 3600,
});

test("host monitoring aggregates local and scoped remote hosts without fixtures", async () => {
  const repository = new MemoryAgentControlRepository();
  await repository.update((state) => {
    state.nodes.push({ ...node(nodeId), telemetry: telemetry() }, node(otherNodeId, "pending"), { ...node(crypto.randomUUID()), status: "revoked", revokedAt: now() });
  });
  const service = new HostMonitoringService(new FakePlatformAdapter(), repository);
  const localOnly = await service.getHosts(false, "all");
  assert.deepEqual(localOnly.hosts.map((host) => host.source), ["controller"]);
  const scoped = await service.getHosts(true, [nodeId, otherNodeId]);
  assert.equal(scoped.hosts.length, 3);
  const remote = scoped.hosts.find((host) => host.id === nodeId);
  assert.equal(remote.name, "remote-host");
  assert.equal(remote.disk.percent, 70);
  assert.equal(remote.memory.usedBytes, 600);
  assert.equal(remote.environment, "受管节点");
  assert.equal(remote.owner, "StackPilot Agent");
  assert.equal(remote.backup, null);
  assert.deepEqual(remote.services, []);
  const pending = scoped.hosts.find((host) => host.id === otherNodeId);
  assert.equal(pending.connectionStatus, "pending");
  assert.equal(pending.healthStatus, "unknown");
  assert.equal(pending.cpuPercent, null);
});

test("host monitoring derives degraded health from unavailable metrics", async () => {
  const repository = new MemoryAgentControlRepository();
  await repository.update((state) => state.nodes.push({
    ...node(nodeId),
    telemetry: { ...telemetry(), cpu: null },
  }));
  const remote = (await new HostMonitoringService(new FakePlatformAdapter(), repository).getHosts(true, "all")).hosts[1];
  assert.equal(remote.healthStatus, "degraded");
  assert.deepEqual(remote.services, []);
});

test("host monitoring keeps an online legacy agent visible while telemetry is unavailable", async () => {
  const repository = new MemoryAgentControlRepository();
  await repository.update((state) => state.nodes.push(node(nodeId)));
  const remote = (await new HostMonitoringService(new FakePlatformAdapter(), repository).getHosts(true, "all")).hosts[1];
  assert.equal(remote.connectionStatus, "online");
  assert.equal(remote.healthStatus, "unknown");
  assert.equal(remote.telemetryCollectedAt, null);
  assert.equal(remote.cpuPercent, null);
  assert.equal(remote.disk, null);
});

test("host monitoring marks stale agents offline without mutating stored state", async () => {
  const repository = new MemoryAgentControlRepository();
  await repository.update((state) => state.nodes.push({ ...node(nodeId), lastSeenAt: new Date(Date.now() - 60_000).toISOString() }));
  const service = new HostMonitoringService(new FakePlatformAdapter(), repository, 45_000);
  assert.equal((await service.getHosts(true, "all")).hosts[1].connectionStatus, "offline");
  assert.equal((await repository.read()).nodes[0].status, "online");
});

test("host monitoring marks old telemetry degraded while heartbeat remains online", async () => {
  const repository = new MemoryAgentControlRepository();
  await repository.update((state) => state.nodes.push({
    ...node(nodeId),
    telemetry: { ...telemetry(), collectedAt: new Date(Date.now() - 60_000).toISOString() },
  }));
  const remote = (await new HostMonitoringService(new FakePlatformAdapter(), repository, 45_000).getHosts(true, "all")).hosts[1];
  assert.equal(remote.connectionStatus, "online");
  assert.equal(remote.healthStatus, "degraded");
  assert.equal(remote.telemetryFreshness, "stale");
  assert.equal(remote.cpuPercent, 20);
});

test("SQLite heartbeat updates only its node row and appends one audit", async () => {
  const database = openDatabase(":memory:");
  try {
    const repository = new SqliteAgentControlRepository(database);
    await repository.update((state) => {
      state.nodes.push(node(nodeId));
      state.tasks.push({ taskId: crypto.randomUUID(), targetNodeId: nodeId, type: "system.summary.read", parameters: {}, status: "queued", attempt: 0, maxAttempts: 1, createdAt: now(), updatedAt: now(), expiresAt: new Date(Date.now() + 60_000).toISOString(), nextAttemptAt: null, startedAt: null, completedAt: null, result: null, errorCode: null, idempotencyKey: "targeted-heartbeat" });
    });
    database.exec("CREATE TRIGGER test_no_task_delete BEFORE DELETE ON remote_tasks BEGIN SELECT RAISE(ABORT, 'tasks untouched'); END");
    database.exec("CREATE TRIGGER test_no_audit_delete BEFORE DELETE ON agent_protocol_audits BEGIN SELECT RAISE(ABORT, 'audits append only'); END");
    await new NodeService(repository).heartbeat(nodeId, { nodeId, agentVersion: "0.2.1", protocolVersion: "1.0", timestamp: now(), platform: "linux", capabilities: ["system.summary.read"], health: { status: "healthy", uptimeSeconds: 10 }, telemetry: telemetry() }, crypto.randomUUID());
    const state = await repository.read();
    assert.equal(state.tasks.length, 1);
    assert.equal(state.nodes[0].telemetry.hostname, "remote-host");
    assert.equal(state.audits.filter((event) => event.event === "node.heartbeat").length, 1);
  } finally { database.close(); }
});

test("targeted heartbeat preserves unauthorized semantics for an unknown node", async () => {
  const repository = new MemoryAgentControlRepository();
  await assert.rejects(
    new NodeService(repository).heartbeat(nodeId, { nodeId, agentVersion: "0.2.1", protocolVersion: "1.0", timestamp: now(), platform: "linux", capabilities: ["system.summary.read"], health: { status: "healthy", uptimeSeconds: 10 } }, crypto.randomUUID()),
    (error) => error.status === 401 && error.code === "UNAUTHORIZED",
  );
});

test("GET /api/hosts requires overview read and exposes only the principal node scope", async () => {
  const database = openDatabase(":memory:");
  const identity = new IdentityService(database, Buffer.alloc(32, 4));
  await identity.createInitialAdministrator("admin", "Administrator", "correct horse battery staple");
  const admin = (await identity.login("admin", "correct horse battery staple", "test", "ua")).principal;
  const repository = new MemoryAgentControlRepository();
  await repository.update((state) => state.nodes.push({ ...node(nodeId), telemetry: telemetry() }, { ...node(otherNodeId), telemetry: telemetry() }));
  const platform = new FakePlatformAdapter();
  const services = createControllerServices(platform, process.cwd(), loadControllerConfig({}), repository);
  const overviewToken = identity.createApiToken(admin, { name: "overview", permissions: ["overview:read"], nodeScope: [], expiresAt: null }).token;
  const nodesToken = identity.createApiToken(admin, { name: "nodes", permissions: ["nodes:read"], nodeScope: "all", expiresAt: null }).token;
  const scopedToken = identity.createApiToken(admin, { name: "scoped", permissions: ["overview:read"], nodeScope: [nodeId], expiresAt: null }).token;
  const server = createStackPilotServer({ env: { STACKPILOT_COOKIE_SECURE: "0" }, platform, services, database, identity });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/hosts`)).status, 401);
    assert.equal((await fetch(`${base}/api/hosts`, { headers: { Authorization: `Bearer ${nodesToken}` } })).status, 403);
    const local = await (await fetch(`${base}/api/hosts`, { headers: { Authorization: `Bearer ${overviewToken}` } })).json();
    assert.deepEqual(local.hosts.map((host) => host.source), ["controller"]);
    const scoped = await (await fetch(`${base}/api/hosts`, { headers: { Authorization: `Bearer ${scopedToken}` } })).json();
    assert.deepEqual(scoped.hosts.map((host) => host.id), ["node-local", nodeId]);
    const legacyHealth = await (await fetch(`${base}/api/overview/health`, { headers: { Authorization: `Bearer ${scopedToken}` } })).json();
    assert.deepEqual(legacyHealth.nodes.map((host) => host.id), ["node-local", nodeId]);
  } finally { server.close(); await once(server, "close"); database.close(); }
});
