import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createControllerServices } from "../../apps/controller/dist/app.js";
import { loadControllerConfig } from "../../apps/controller/dist/config/environment.js";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { IdentityService } from "../../apps/controller/dist/identity/identityService.js";
import { createStackPilotServer } from "../../apps/controller/dist/server.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";

const origin = "http://127.0.0.1:5173";
const collectedAt = "2026-07-15T00:00:00.000Z";
const unit = { id: "nginx.service", name: "nginx.service", description: "Nginx", host: "prod-host", state: "active", activeState: "active", subState: "running", restarts: 0, memoryBytes: 1024, stateChangedAt: collectedAt, availableActions: ["start", "stop", "restart"] };

async function withServer(callback) {
  const database = openDatabase(":memory:"); const identity = new IdentityService(database, Buffer.alloc(32, 9));
  await identity.createInitialAdministrator("admin", "Administrator", "correct horse battery staple");
  const login = await identity.login("admin", "correct horse battery staple", "test", "node-test");
  const apiToken = identity.createApiToken(login.principal, { name: "systemd-tests", permissions: [...login.principal.permissions], nodeScope: "all", expiresAt: null }).token;
  const services = createControllerServices(new FakePlatformAdapter(), process.cwd(), loadControllerConfig({}), undefined, database);
  const calls = [];
  services.systemd = {
    async list() { calls.push(["list"]); return { units: [unit], collectedAt, host: unit.host, warnings: [] }; },
    async logs(name) { calls.push(["logs", name]); return { unit: name, entries: [{ timestamp: collectedAt, message: "real journal line" }], collectedAt, truncated: false }; },
    async action(name, action, requestId) { calls.push(["action", name, action, requestId]); return { ...unit, state: action === "stop" ? "inactive" : "active", activeState: action === "stop" ? "inactive" : "active" }; },
  };
  const server = createStackPilotServer({ env: { STACKPILOT_COOKIE_SECURE: "0" }, platform: new FakePlatformAdapter(), database, identity, services });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); const baseUrl = `http://127.0.0.1:${address.port}`;
  try { await callback(baseUrl, { apiToken, calls }); }
  finally { server.close(); await once(server, "close"); database.close(); }
}

test("systemd reads require authentication and return backend collection time", async () => {
  await withServer(async (baseUrl, { apiToken, calls }) => {
    assert.equal((await fetch(`${baseUrl}/api/systemd/services`)).status, 401);
    const list = await fetch(`${baseUrl}/api/systemd/services`, { headers: { Authorization: `Bearer ${apiToken}` } });
    assert.equal(list.status, 200); assert.equal(list.headers.get("cache-control"), "no-store"); assert.equal((await list.json()).collectedAt, collectedAt);
    const logs = await fetch(`${baseUrl}/api/systemd/services/nginx.service/logs`, { headers: { Authorization: `Bearer ${apiToken}` } });
    assert.equal(logs.status, 200); assert.equal(logs.headers.get("cache-control"), "no-store"); assert.equal((await logs.json()).entries[0].message, "real journal line");
    assert.deepEqual(calls, [["list"], ["logs", "nginx.service"]]);
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
