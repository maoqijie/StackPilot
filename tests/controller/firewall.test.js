import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createControllerServices } from "../../apps/controller/dist/app.js";
import { loadControllerConfig } from "../../apps/controller/dist/config/environment.js";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { IdentityService } from "../../apps/controller/dist/identity/identityService.js";
import { FirewallDenyService } from "../../apps/controller/dist/modules/firewall/firewallDenyService.js";
import { FirewallOpenPortService, parseListeningSockets } from "../../apps/controller/dist/modules/firewall/firewallOpenPortService.js";
import { NodeService } from "../../apps/controller/dist/modules/nodes/nodeService.js";
import { MemoryAgentControlRepository } from "../../apps/controller/dist/repositories/agentControlRepository.js";
import { SqliteAgentControlRepository } from "../../apps/controller/dist/repositories/sqliteAgentControlRepository.js";
import { createStackPilotServer } from "../../apps/controller/dist/server.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";

const allowedId = "11111111-1111-4111-8111-111111111111";
const hiddenId = "22222222-2222-4222-8222-222222222222";
const denyCollectedAt = "2026-07-15T00:00:00.000Z";
const openPortsCollectedAt = "2026-07-15T06:00:00.000Z";
const event = (marker) => ({ id: `fw_${marker.repeat(64)}`, occurredAt: denyCollectedAt, sourceAddress: marker === "a" ? "198.51.100.24" : "203.0.113.18", destinationAddress: "192.0.2.10", destinationPort: 22, protocol: "TCP", interfaceName: "eth0", rule: "UFW BLOCK", reason: `${marker}-deny` });
const node = (nodeId, name, marker) => ({ nodeId, nodeName: name, status: "online", agentVersion: "0.3.0", protocolVersion: "1.1", platform: "linux", declaredCapabilities: [], allowedCapabilities: [], enrolledAt: denyCollectedAt, lastSeenAt: denyCollectedAt, revokedAt: null, firewallDenySnapshot: { collectedAt: denyCollectedAt, collectionStatus: "complete", warnings: [], events: [event(marker)] } });

test("firewall deny service aggregates persisted snapshots within stable node scope", async () => {
  const database = openDatabase(":memory:"); const repository = new SqliteAgentControlRepository(database);
  await repository.update((state) => state.nodes.push(node(allowedId, "allowed-host", "a"), node(hiddenId, "hidden-host", "b")));
  const heartbeatAt = new Date().toISOString();
  await new NodeService(repository).heartbeat(allowedId, {
    nodeId: allowedId, agentVersion: "0.3.0", protocolVersion: "1.1", timestamp: heartbeatAt, platform: "linux", capabilities: [],
    health: { status: "healthy", uptimeSeconds: 1 },
    firewallDenySnapshot: { collectedAt: heartbeatAt, collectionStatus: "complete", warnings: [], events: [{ ...event("a"), occurredAt: heartbeatAt }] },
  }, crypto.randomUUID());
  const payload = await new FirewallDenyService(repository).list([allowedId]);
  assert.equal(payload.records.length, 1);
  assert.equal(payload.records[0].nodeId, allowedId);
  assert.match(payload.records[0].id, new RegExp(`^${allowedId}:fw_`));
  assert.doesNotMatch(JSON.stringify(payload), /hidden-host|b-deny|203\.0\.113\.18/);
  database.close();
});

test("firewall deny service reports source freshness, drops expired events, and bounds warnings", async () => {
  const repository = new MemoryAgentControlRepository();
  const now = Date.parse("2026-07-15T12:00:00.000Z");
  const stale = node(allowedId, "n".repeat(120), "a");
  stale.status = "offline";
  stale.lastSeenAt = "2026-07-15T11:00:00.000Z";
  stale.firewallDenySnapshot = { collectedAt: "2026-07-15T11:00:00.000Z", collectionStatus: "complete", warnings: ["w".repeat(256)], events: [{ ...event("a"), occurredAt: "2026-07-14T11:59:59.000Z" }] };
  await repository.update((state) => state.nodes.push(stale));
  const payload = await new FirewallDenyService(repository, 90_000, () => now).list("all");
  assert.equal(payload.collectedAt, stale.firewallDenySnapshot.collectedAt);
  assert.equal(payload.collectionStatus, "partial");
  assert.equal(payload.records.length, 0);
  assert.ok(payload.warnings.some((warning) => warning.endsWith("firewall deny snapshot is stale")));
  assert.ok(payload.warnings.every((warning) => [...warning].length <= 256));
});

test("firewall deny service rejects timestamps beyond the allowed clock skew", async () => {
  const repository = new MemoryAgentControlRepository();
  const now = Date.parse("2026-07-15T12:00:00.000Z");
  const futureSnapshot = node(allowedId, "future-snapshot", "a");
  futureSnapshot.lastSeenAt = "2026-07-15T12:00:00.000Z";
  futureSnapshot.firewallDenySnapshot = { ...futureSnapshot.firewallDenySnapshot, collectedAt: "2099-01-01T00:00:00.000Z", events: [{ ...event("a"), occurredAt: "2099-01-01T00:00:00.000Z" }] };
  const futureEvent = node(hiddenId, "future-event", "b");
  futureEvent.lastSeenAt = "2026-07-15T12:00:00.000Z";
  futureEvent.firewallDenySnapshot = { ...futureEvent.firewallDenySnapshot, collectedAt: "2026-07-15T12:00:00.000Z", events: [{ ...event("b"), occurredAt: "2099-01-01T00:00:00.000Z" }] };
  await repository.update((state) => state.nodes.push(futureSnapshot, futureEvent));

  const payload = await new FirewallDenyService(repository, 90_000, () => now).list("all");

  assert.equal(payload.collectedAt, futureEvent.firewallDenySnapshot.collectedAt);
  assert.equal(payload.collectionStatus, "partial");
  assert.deepEqual(payload.records, []);
  assert.ok(payload.warnings.some((warning) => warning.includes("snapshot timestamp is in the future")));
  assert.ok(payload.warnings.some((warning) => warning.includes("future firewall deny events were ignored")));
});

test("firewall deny service uses no synthetic collection timestamp while awaiting snapshots", async () => {
  const repository = new MemoryAgentControlRepository(); const awaiting = node(allowedId, "awaiting-host", "a");
  delete awaiting.firewallDenySnapshot; await repository.update((state) => state.nodes.push(awaiting));
  const payload = await new FirewallDenyService(repository).list("all");
  assert.equal(payload.collectedAt, null); assert.equal(payload.collectionStatus, "unavailable");
});

test("firewall deny HTTP endpoint requires firewall read and preserves node scope", async () => {
  const database = openDatabase(":memory:"); const identity = new IdentityService(database, Buffer.alloc(32, 7));
  await identity.createInitialAdministrator("admin", "Administrator", "correct horse battery staple");
  const admin = (await identity.login("admin", "correct horse battery staple", "test", "ua")).principal;
  const repository = new MemoryAgentControlRepository();
  await repository.update((state) => state.nodes.push(node(allowedId, "allowed-host", "a"), node(hiddenId, "hidden-host", "b")));
  const services = createControllerServices(new FakePlatformAdapter(), process.cwd(), loadControllerConfig({}), repository, database);
  const scoped = identity.createApiToken(admin, { name: "firewall-scoped", permissions: ["firewall:read"], nodeScope: [allowedId], expiresAt: null }).token;
  const forbidden = identity.createApiToken(admin, { name: "nodes-only", permissions: ["nodes:read"], nodeScope: "all", expiresAt: null }).token;
  const server = createStackPilotServer({ env: { STACKPILOT_COOKIE_SECURE: "0" }, services, database, identity });
  server.listen(0, "127.0.0.1"); await once(server, "listening"); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/firewall/deny-records`)).status, 401);
    assert.equal((await fetch(`${base}/api/firewall/deny-records`, { headers: { Authorization: `Bearer ${forbidden}` } })).status, 403);
    const response = await fetch(`${base}/api/firewall/deny-records`, { headers: { Authorization: `Bearer ${scoped}` } }); const body = await response.json();
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(body.records.length, 1); assert.equal(body.records[0].nodeId, allowedId);
    assert.doesNotMatch(JSON.stringify(body), /hidden-host|b-deny/);
  } finally { server.close(); await once(server, "close"); database.close(); }
});

test("socket parser classifies real bind addresses and emits stable identifiers", () => {
  const input = ["tcp LISTEN 0 511 0.0.0.0:443 0.0.0.0:*", "tcp LISTEN 0 128 127.0.0.1:18787 0.0.0.0:*", "udp UNCONN 0 0 127.0.0.53%lo:53 0.0.0.0:*", "udp UNCONN 0 0 10.0.0.8:53 0.0.0.0:*", "tcp LISTEN 0 511 [::]:80 [::]:*", "tcp LISTEN 0 511 [::1]:6379 [::]:*"].join("\n");
  const first = parseListeningSockets(input, "prod-controller"); const second = parseListeningSockets(input, "prod-controller");
  assert.deepEqual(first, second);
  assert.deepEqual(first.map((row) => [row.port, row.exposure]), [[53, "private"], [53, "loopback"], [80, "public"], [443, "public"], [6379, "loopback"], [18787, "loopback"]]);
  assert.match(first[0].id, /^port_[a-f0-9]{24}$/);
});

test("collector marks probe failures unavailable without fixture rows", async () => {
  const payload = await new FirewallOpenPortService(async () => { throw new Error("ss unavailable"); }, "prod-controller").list();
  assert.equal(payload.collectionStatus, "unavailable"); assert.deepEqual(payload.ports, []); assert.match(payload.warnings[0], /暂不可用/);
});

test("firewall open-port route requires permission and returns backend collection time", async () => {
  const database = openDatabase(":memory:"); const identity = new IdentityService(database, Buffer.alloc(32, 6));
  await identity.createInitialAdministrator("admin", "Administrator", "correct horse battery staple");
  const login = await identity.login("admin", "correct horse battery staple", "test", "node-test");
  const token = identity.createApiToken(login.principal, { name: "firewall-read", permissions: ["firewall:read"], nodeScope: "all", expiresAt: null }).token;
  const services = createControllerServices(new FakePlatformAdapter(), process.cwd(), loadControllerConfig({}), undefined, database);
  services.firewallOpenPorts = { async list() { return { collectedAt: openPortsCollectedAt, collectionStatus: "complete", backend: "ss", warnings: [], ports: [] }; } };
  const server = createStackPilotServer({ env: { STACKPILOT_COOKIE_SECURE: "0" }, platform: new FakePlatformAdapter(), database, identity, services });
  server.listen(0, "127.0.0.1"); await once(server, "listening"); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/firewall/open-ports`)).status, 401);
    const response = await fetch(`${base}/api/firewall/open-ports`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal((await response.json()).collectedAt, openPortsCollectedAt);
  } finally { server.close(); await once(server, "close"); database.close(); }
});
