import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createControllerServices } from "../../apps/controller/dist/app.js";
import { loadControllerConfig } from "../../apps/controller/dist/config/environment.js";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { IdentityService } from "../../apps/controller/dist/identity/identityService.js";
import { FirewallService } from "../../apps/controller/dist/modules/firewall/firewallService.js";
import { FirewallHelperError } from "../../apps/controller/dist/platform/firewallClient.js";
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
});

test("collector marks probe failures unavailable without fixture rows", async () => {
  const payload = await new FirewallOpenPortService(async () => { throw new Error("ss unavailable"); }, "prod-controller").list();
  assert.equal(payload.collectionStatus, "unavailable"); assert.deepEqual(payload.ports, []); assert.match(payload.warnings[0], /暂不可用/);
});

const rulesPayload = { engine: "ufw", host: "host-a", active: true, collectedAt: new Date().toISOString(), collectionStatus: "complete", warnings: [], rules: [] };
test("firewall service parses helper responses and sends fixed mutation requests", async () => {
  const requests = []; const service = new FirewallService(async (request) => { requests.push(request); return { ok: true, operation: request.operation, data: rulesPayload }; });
  assert.equal((await service.list()).engine, "ufw");
  const created = await service.create({ name: "HTTPS", port: 443, protocol: "tcp", source: "0.0.0.0/0", idempotencyKey: "11111111-1111-4111-8111-111111111111" });
  assert.equal(created.tone, "success"); assert.equal(requests[1].operation, "firewall-create"); assert.equal(requests[1].requestId, "11111111-1111-4111-8111-111111111111");
});

test("firewall service maps helper validation and idempotency failures", async () => {
  for (const [code, status] of [["INVALID_FIREWALL_SOURCE", 400], ["FIREWALL_IDEMPOTENCY_CONFLICT", 409]]) {
    const helper = async () => { throw new FirewallHelperError(code); };
    await assert.rejects(new FirewallService(helper).create({ name: "HTTPS", port: 443, protocol: "tcp", source: "0.0.0.0/0", idempotencyKey: crypto.randomUUID() }), (error) => error.status === status);
  }
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

test("firewall HTTP routes enforce authentication, permission and one-time reauthentication", async () => {
  const database = openDatabase(":memory:"); const identity = new IdentityService(database, Buffer.alloc(32, 7)); const password = "correct horse battery staple";
  await identity.createInitialAdministrator("admin", "Administrator", password); const principal = (await identity.login("admin", password, "fixture", "node-test")).principal;
  identity.upsertRole(principal, "firewall-operate-only", "Firewall Operate Only", "", ["firewall:operate"]);
  await identity.createUser(principal, "firewall-operator", "Firewall Operator", password, ["firewall-operate-only"], "all");
  const readToken = identity.createApiToken(principal, { name: "read", permissions: ["firewall:read"], nodeScope: "all", expiresAt: null }).token;
  const scopedReadToken = identity.createApiToken(principal, { name: "scoped-read", permissions: ["firewall:read"], nodeScope: ["00000000-0000-4000-8000-000000000002"], expiresAt: null }).token;
  const outOfScopeToken = identity.createApiToken(principal, { name: "out-of-scope", permissions: ["firewall:read"], nodeScope: [], expiresAt: null }).token;
  const wrongToken = identity.createApiToken(principal, { name: "wrong", permissions: ["overview:read"], nodeScope: "all", expiresAt: null }).token;
  const operateToken = identity.createApiToken(principal, { name: "operate", permissions: ["firewall:operate"], nodeScope: "all", expiresAt: null }).token;
  const services = createControllerServices(new FakePlatformAdapter(), process.cwd(), loadControllerConfig({}), undefined, database); const calls = [];
  services.firewall = { async list() { calls.push("list"); return rulesPayload; }, async create(input) { calls.push(["create", input]); return { ...rulesPayload, message: "规则已应用", tone: "success" }; }, async delete() { throw new Error("not used"); } };
  const server = createStackPilotServer({ env: { STACKPILOT_COOKIE_SECURE: "0", STACKPILOT_ALLOWED_ORIGINS: "http://127.0.0.1:5173" }, database, identity, services, platform: new FakePlatformAdapter() });
  server.listen(0, "127.0.0.1"); await once(server, "listening"); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/firewall/rules`)).status, 401);
    assert.equal((await fetch(`${base}/api/firewall/rules`, { headers: { Authorization: `Bearer ${wrongToken}` } })).status, 403);
    assert.equal((await fetch(`${base}/api/firewall/rules`, { headers: { Authorization: `Bearer ${outOfScopeToken}` } })).status, 403);
    assert.equal((await fetch(`${base}/api/firewall/rules`, { headers: { Authorization: `Bearer ${scopedReadToken}` } })).status, 200);
    assert.equal((await fetch(`${base}/api/firewall/rules`, { headers: { Authorization: `Bearer ${readToken}` } })).status, 200);
    const createBody = { name: "HTTPS", port: 443, protocol: "tcp", source: "0.0.0.0/0", idempotencyKey: crypto.randomUUID() };
    assert.equal((await fetch(`${base}/api/firewall/rules`, { method: "POST", headers: { Authorization: `Bearer ${operateToken}`, "Content-Type": "application/json" }, body: JSON.stringify(createBody) })).status, 403);
    const operatorLogin = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { Origin: "http://127.0.0.1:5173", "Content-Type": "application/json" }, body: JSON.stringify({ username: "firewall-operator", password }) });
    const operatorBody = await operatorLogin.json(); const operatorCookie = operatorLogin.headers.get("set-cookie").split(";")[0];
    const operatorHeaders = { Cookie: operatorCookie, Origin: "http://127.0.0.1:5173", "X-CSRF-Token": operatorBody.csrfToken, "Content-Type": "application/json" };
    const operatorReauth = await fetch(`${base}/api/auth/reauthenticate`, { method: "POST", headers: operatorHeaders, body: JSON.stringify({ password }) });
    const operatorProof = (await operatorReauth.json()).proof;
    assert.equal((await fetch(`${base}/api/firewall/rules`, { method: "POST", headers: { ...operatorHeaders, "X-Reauth-Proof": operatorProof }, body: JSON.stringify(createBody) })).status, 403);
    const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { Origin: "http://127.0.0.1:5173", "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password }) });
    const loginBody = await login.json(); const cookie = login.headers.get("set-cookie").split(";")[0];
    const reauth = await fetch(`${base}/api/auth/reauthenticate`, { method: "POST", headers: { Cookie: cookie, Origin: "http://127.0.0.1:5173", "X-CSRF-Token": loginBody.csrfToken, "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const proof = (await reauth.json()).proof;
    const invalid = await fetch(`${base}/api/firewall/rules`, { method: "POST", headers: { Cookie: cookie, Origin: "http://127.0.0.1:5173", "X-CSRF-Token": loginBody.csrfToken, "X-Reauth-Proof": proof, "Content-Type": "application/json" }, body: JSON.stringify({ ...createBody, port: 0 }) });
    assert.equal(invalid.status, 400);
    const created = await fetch(`${base}/api/firewall/rules`, { method: "POST", headers: { Cookie: cookie, Origin: "http://127.0.0.1:5173", "X-CSRF-Token": loginBody.csrfToken, "X-Reauth-Proof": proof, "Content-Type": "application/json" }, body: JSON.stringify(createBody) });
    assert.equal(created.status, 201); assert.equal(calls.some((entry) => Array.isArray(entry) && entry[0] === "create"), true);
  } finally { server.close(); await once(server, "close"); database.close(); }
});
