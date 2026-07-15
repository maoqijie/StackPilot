import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createControllerServices } from "../../apps/controller/dist/app.js";
import { loadControllerConfig } from "../../apps/controller/dist/config/environment.js";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { IdentityService } from "../../apps/controller/dist/identity/identityService.js";
import { SystemdService } from "../../apps/controller/dist/modules/systemd/systemdService.js";
import { MemoryAgentControlRepository } from "../../apps/controller/dist/repositories/agentControlRepository.js";
import { createStackPilotServer } from "../../apps/controller/dist/server.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";

const origin = "http://127.0.0.1:5173";
const collectedAt = "2026-07-15T00:00:00.000Z";
const allowedId = "11111111-1111-4111-8111-111111111111";
const hiddenId = "22222222-2222-4222-8222-222222222222";
const unit = { id: "nginx.service", name: "nginx.service", description: "Nginx", host: "prod-host", state: "active", activeState: "active", subState: "running", restarts: 0, memoryBytes: 1024, stateChangedAt: collectedAt, availableActions: ["start", "stop", "restart"] };

function node(nodeId, nodeName, systemdUnit) {
  return { nodeId, nodeName, status: "online", agentVersion: "0.3.0", protocolVersion: "1.1", platform: "linux", declaredCapabilities: [], allowedCapabilities: [], enrolledAt: collectedAt, lastSeenAt: collectedAt, revokedAt: null,
    systemdSnapshot: { collectedAt, collectionStatus: "complete", warnings: [], services: [{ unit: systemdUnit, description: systemdUnit, loadState: "loaded", activeState: "active", subState: "running", memoryCurrentBytes: 1024, restartCount: 1, stateChangedAt: collectedAt, journal: [] }] } };
}

async function withServer(callback) {
  const database = openDatabase(":memory:"); const identity = new IdentityService(database, Buffer.alloc(32, 9));
  await identity.createInitialAdministrator("admin", "Administrator", "correct horse battery staple");
  const login = await identity.login("admin", "correct horse battery staple", "test", "node-test");
  const apiToken = identity.createApiToken(login.principal, { name: "systemd-tests", permissions: [...login.principal.permissions], nodeScope: "all", expiresAt: null }).token;
  const services = createControllerServices(new FakePlatformAdapter(), process.cwd(), loadControllerConfig({}), undefined, database);
  const calls = [];
  services.systemd = {
    async list(nodeScope) {
      calls.push(["list", nodeScope]);
      if (nodeScope === undefined) return { units: [unit], collectedAt, host: unit.host, warnings: [] };
      return { collectedAt, collectionStatus: "complete", warnings: [], services: [{ unit: unit.name, description: unit.description, loadState: "loaded", activeState: unit.activeState, subState: unit.subState, memoryCurrentBytes: unit.memoryBytes, restartCount: unit.restarts, stateChangedAt: collectedAt, journal: [], id: `${allowedId}:${unit.name}`, nodeId: allowedId, host: unit.host, platform: "linux", sourceCollectedAt: collectedAt, freshness: "current" }] };
    },
    async logs(name) { calls.push(["logs", name]); return { unit: name, entries: [{ timestamp: collectedAt, message: "real journal line" }], collectedAt, truncated: false }; },
    async action(name, action, requestId) { calls.push(["action", name, action, requestId]); return { ...unit, state: action === "stop" ? "inactive" : "active", activeState: action === "stop" ? "inactive" : "active" }; },
  };
  const server = createStackPilotServer({ env: { STACKPILOT_COOKIE_SECURE: "0" }, platform: new FakePlatformAdapter(), database, identity, services });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); const baseUrl = `http://127.0.0.1:${address.port}`;
  try { await callback(baseUrl, { apiToken, calls }); }
  finally { server.close(); await once(server, "close"); database.close(); }
}

test("systemd service filters snapshots by stable node scope", async () => {
  const repository = new MemoryAgentControlRepository();
  await repository.update((state) => state.nodes.push(node(allowedId, "allowed-host", "nginx.service"), node(hiddenId, "hidden-host", "secret.service")));
  const payload = await new SystemdService(repository, Number.MAX_SAFE_INTEGER).list([allowedId]);
  assert.equal(payload.services.length, 1); assert.equal(payload.services[0].host, "allowed-host"); assert.equal(payload.services[0].id, `${allowedId}:nginx.service`);
  assert.doesNotMatch(JSON.stringify(payload), /hidden-host|secret\.service/);
});

test("systemd service labels missing snapshots unavailable instead of fabricating rows", async () => {
  const repository = new MemoryAgentControlRepository();
  const missing = node(allowedId, "awaiting-host", "nginx.service"); delete missing.systemdSnapshot;
  await repository.update((state) => state.nodes.push(missing));
  const payload = await new SystemdService(repository).list("all");
  assert.equal(payload.collectionStatus, "unavailable"); assert.deepEqual(payload.services, []); assert.match(payload.warnings[0], /awaiting/);
});

test("systemd reads require authentication and preserve backend collection time", async () => {
  await withServer(async (baseUrl, { apiToken, calls }) => {
    assert.equal((await fetch(`${baseUrl}/api/systemd/services`)).status, 401);
    const list = await fetch(`${baseUrl}/api/systemd/services`, { headers: { Authorization: `Bearer ${apiToken}` } });
    assert.equal(list.status, 200); assert.equal(list.headers.get("cache-control"), "no-store"); assert.equal((await list.json()).collectedAt, collectedAt);
    const logs = await fetch(`${baseUrl}/api/systemd/services/nginx.service/logs`, { headers: { Authorization: `Bearer ${apiToken}` } });
    assert.equal(logs.status, 200); assert.equal(logs.headers.get("cache-control"), "no-store"); assert.equal((await logs.json()).entries[0].message, "real journal line");
    assert.deepEqual(calls, [["list", "all"], ["logs", "nginx.service"]]);
  });
});

test("systemd mutations require CSRF and one-time reauthentication before dispatch", async () => {
  await withServer(async (baseUrl, { calls }) => {
    const login = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: "correct horse battery staple" }) });
    const auth = await login.json(); const cookie = login.headers.get("set-cookie").split(";")[0];
    const idempotencyKey = crypto.randomUUID();
    const withoutProof = await fetch(`${baseUrl}/api/systemd/services/nginx.service/stop`, { method: "POST", headers: { Origin: origin, Cookie: cookie, "X-CSRF-Token": auth.csrfToken, "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey }) });
    assert.equal(withoutProof.status, 403); assert.equal(calls.length, 0);
    const reauthResponse = await fetch(`${baseUrl}/api/auth/reauthenticate`, { method: "POST", headers: { Origin: origin, Cookie: cookie, "X-CSRF-Token": auth.csrfToken, "Content-Type": "application/json" }, body: JSON.stringify({ password: "correct horse battery staple" }) });
    const reauth = await reauthResponse.json();
    const mutation = await fetch(`${baseUrl}/api/systemd/services/nginx.service/stop`, { method: "POST", headers: { Origin: origin, Cookie: cookie, "X-CSRF-Token": auth.csrfToken, "X-Reauth-Proof": reauth.proof, "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey }) });
    assert.equal(mutation.status, 200); assert.equal((await mutation.json()).unit.state, "inactive"); assert.deepEqual(calls[0].slice(0, 4), ["action", "nginx.service", "stop", idempotencyKey]);
    const replay = await fetch(`${baseUrl}/api/systemd/services/nginx.service/stop`, { method: "POST", headers: { Origin: origin, Cookie: cookie, "X-CSRF-Token": auth.csrfToken, "X-Reauth-Proof": reauth.proof, "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey }) });
    assert.equal(replay.status, 403); assert.equal(calls.length, 1);
  });
});

test("systemd route rejects unsafe unit names before backend access", async () => {
  await withServer(async (baseUrl, { apiToken, calls }) => {
    const response = await fetch(`${baseUrl}/api/systemd/services/${encodeURIComponent("../../etc/passwd")}/logs`, { headers: { Authorization: `Bearer ${apiToken}` } });
    assert.equal(response.status, 400); assert.equal(calls.length, 0);
  });
});

test("systemd HTTP route returns scoped agent snapshots", async () => {
  const database = openDatabase(":memory:"); const repository = new MemoryAgentControlRepository();
  const identity = new IdentityService(database, Buffer.alloc(32, 4)); await identity.createInitialAdministrator("admin", "Administrator", "correct horse battery staple");
  await repository.update((state) => state.nodes.push(node(allowedId, "allowed-host", "nginx.service")));
  const config = loadControllerConfig({ STACKPILOT_COOKIE_SECURE: "0", STACKPILOT_ALLOWED_ORIGINS: origin });
  const services = createControllerServices(new FakePlatformAdapter(), process.cwd(), config, repository, database);
  const server = createStackPilotServer({ config, services, database, identity }); server.listen(0, "127.0.0.1"); await once(server, "listening"); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: "correct horse battery staple" }) });
    const cookie = login.headers.get("set-cookie").split(";")[0]; const response = await fetch(`${base}/api/systemd/services`, { headers: { Cookie: cookie } }); const body = await response.json();
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(body.services[0].unit, "nginx.service");
  } finally { server.close(); await once(server, "close"); database.close(); }
});
