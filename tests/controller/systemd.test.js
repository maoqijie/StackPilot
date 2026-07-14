import assert from "node:assert/strict";
import test from "node:test";
import { MemoryAgentControlRepository } from "../../apps/controller/dist/repositories/agentControlRepository.js";
import { SystemdService } from "../../apps/controller/dist/modules/systemd/systemdService.js";
import { createStackPilotServer } from "../../apps/controller/dist/server.js";
import { createControllerServices } from "../../apps/controller/dist/app.js";
import { loadControllerConfig } from "../../apps/controller/dist/config/environment.js";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { IdentityService } from "../../apps/controller/dist/identity/identityService.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";
import { once } from "node:events";

const allowedId = "11111111-1111-4111-8111-111111111111";
const hiddenId = "22222222-2222-4222-8222-222222222222";
const now = "2026-07-15T00:00:00.000Z";
function node(nodeId, nodeName, unit) {
  return { nodeId, nodeName, status: "online", agentVersion: "0.3.0", protocolVersion: "1.1", platform: "linux", declaredCapabilities: [], allowedCapabilities: [], enrolledAt: now, lastSeenAt: now, revokedAt: null,
    systemdSnapshot: { collectedAt: now, collectionStatus: "complete", warnings: [], services: [{ unit, description: unit, loadState: "loaded", activeState: "active", subState: "running", memoryCurrentBytes: 1024, restartCount: 1, stateChangedAt: now, journal: [] }] } };
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

test("systemd HTTP route enforces authentication and returns scoped snapshots", async () => {
  const database = openDatabase(":memory:"); const repository = new MemoryAgentControlRepository(); const origin = "http://127.0.0.1:5173";
  const identity = new IdentityService(database, Buffer.alloc(32, 4)); await identity.createInitialAdministrator("admin", "Administrator", "correct horse battery staple");
  await repository.update((state) => state.nodes.push(node(allowedId, "allowed-host", "nginx.service")));
  const config = loadControllerConfig({ STACKPILOT_COOKIE_SECURE: "0", STACKPILOT_ALLOWED_ORIGINS: origin });
  const services = createControllerServices(new FakePlatformAdapter(), process.cwd(), config, repository, database);
  const server = createStackPilotServer({ config, services, database, identity }); server.listen(0, "127.0.0.1"); await once(server, "listening"); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/systemd/services`)).status, 401);
    const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: "correct horse battery staple" }) });
    const cookie = login.headers.get("set-cookie").split(";")[0]; const response = await fetch(`${base}/api/systemd/services`, { headers: { Cookie: cookie } }); const body = await response.json();
    assert.equal(response.status, 200); assert.equal(body.services[0].unit, "nginx.service");
  } finally { server.close(); await once(server, "close"); database.close(); }
});
