import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createControllerServices } from "../../apps/controller/dist/app.js";
import { loadControllerConfig } from "../../apps/controller/dist/config/environment.js";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { IdentityService } from "../../apps/controller/dist/identity/identityService.js";
import { FirewallService } from "../../apps/controller/dist/modules/firewall/firewallService.js";
import { createStackPilotServer } from "../../apps/controller/dist/server.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";

const payload = { engine: "ufw", host: "host-a", active: true, collectedAt: new Date().toISOString(), collectionStatus: "complete", warnings: [], rules: [] };
test("firewall service parses helper responses and sends fixed mutation requests", async () => {
  const requests = []; const service = new FirewallService(async (request) => { requests.push(request); return { ok: true, operation: request.operation, data: payload }; });
  assert.equal((await service.list()).engine, "ufw");
  const created = await service.create({ name: "HTTPS", port: 443, protocol: "tcp", source: "0.0.0.0/0", idempotencyKey: "11111111-1111-4111-8111-111111111111" });
  assert.equal(created.tone, "success"); assert.equal(requests[1].operation, "firewall-create"); assert.equal(requests[1].requestId, "11111111-1111-4111-8111-111111111111");
});

test("firewall HTTP routes enforce authentication, permission and one-time reauthentication", async () => {
  const database = openDatabase(":memory:"); const identity = new IdentityService(database, Buffer.alloc(32, 7)); const password = "correct horse battery staple";
  await identity.createInitialAdministrator("admin", "Administrator", password); const principal = (await identity.login("admin", password, "fixture", "node-test")).principal;
  const readToken = identity.createApiToken(principal, { name: "read", permissions: ["firewall:read"], nodeScope: "all", expiresAt: null }).token;
  const wrongToken = identity.createApiToken(principal, { name: "wrong", permissions: ["overview:read"], nodeScope: "all", expiresAt: null }).token;
  const operateToken = identity.createApiToken(principal, { name: "operate", permissions: ["firewall:operate"], nodeScope: "all", expiresAt: null }).token;
  const services = createControllerServices(new FakePlatformAdapter(), process.cwd(), loadControllerConfig({}), undefined, database); const calls = [];
  services.firewall = { async list() { calls.push("list"); return payload; }, async create(input) { calls.push(["create", input]); return { ...payload, message: "规则已应用", tone: "success" }; }, async delete() { throw new Error("not used"); } };
  const server = createStackPilotServer({ env: { STACKPILOT_COOKIE_SECURE: "0", STACKPILOT_ALLOWED_ORIGINS: "http://127.0.0.1:5173" }, database, identity, services, platform: new FakePlatformAdapter() });
  server.listen(0, "127.0.0.1"); await once(server, "listening"); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/firewall/rules`)).status, 401);
    assert.equal((await fetch(`${base}/api/firewall/rules`, { headers: { Authorization: `Bearer ${wrongToken}` } })).status, 403);
    assert.equal((await fetch(`${base}/api/firewall/rules`, { headers: { Authorization: `Bearer ${readToken}` } })).status, 200);
    const createBody = { name: "HTTPS", port: 443, protocol: "tcp", source: "0.0.0.0/0", idempotencyKey: crypto.randomUUID() };
    assert.equal((await fetch(`${base}/api/firewall/rules`, { method: "POST", headers: { Authorization: `Bearer ${operateToken}`, "Content-Type": "application/json" }, body: JSON.stringify(createBody) })).status, 403);
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
