import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createControllerServices } from "../../apps/controller/dist/app.js";
import { loadControllerConfig } from "../../apps/controller/dist/config/environment.js";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { IdentityService } from "../../apps/controller/dist/identity/identityService.js";
import { FirewallService } from "../../apps/controller/dist/modules/firewall/firewallService.js";
import { FIREWALL_HELPER_TIMEOUT_MS, requestFirewallHelper } from "../../apps/controller/dist/platform/firewallClient.js";
import { createStackPilotServer } from "../../apps/controller/dist/server.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";

const collectedAt = "2026-07-15T06:00:00.000Z";
const firewallPayload = { collectedAt, collectionStatus: "complete", backend: "ufw", backendStatus: "active", host: "host-a", warnings: [], rules: [] };

test("firewall helper timeout budgets cover the serialized command chain", async () => {
  assert.deepEqual(FIREWALL_HELPER_TIMEOUT_MS, { list: 90_000, mutation: 120_000 });
  const directory = await mkdtemp(join(tmpdir(), "stackpilot-firewall-socket-"));
  const socketPath = join(directory, "helper.sock");
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    socket.on("data", () => setTimeout(() => socket.end(`${JSON.stringify({ ok: true, operation: "firewall-list", data: firewallPayload })}\n`), 25));
  });
  server.listen(socketPath); await once(server, "listening");
  try {
    const response = await requestFirewallHelper({ operation: "firewall-list" }, socketPath, 100);
    assert.equal(response.ok, true);
  } finally {
    server.close(); await once(server, "close"); await rm(directory, { recursive: true, force: true });
  }
});

test("firewall service parses helper data and reuses an idempotent mutation", async () => {
  const calls = [];
  const helper = async (request) => { calls.push(request); return { ok: true, operation: request.operation, data: firewallPayload }; };
  const service = new FirewallService(helper); const idempotencyKey = crypto.randomUUID();
  assert.deepEqual(await service.list(), firewallPayload);
  const input = { name: "HTTPS", port: 443, protocol: "TCP", source: "0.0.0.0/0", idempotencyKey };
  await Promise.all([service.create(input), service.create(input)]);
  assert.equal(calls.filter((call) => call.operation === "firewall-create").length, 1);
  assert.throws(() => service.delete(`fw_${"a".repeat(64)}`, idempotencyKey), /幂等键已用于其他/);
});

test("firewall service maps inactive helper writes to a conflict", async () => {
  const helper = async (request) => {
    if (request.operation === "firewall-list") return { ok: true, operation: request.operation, data: firewallPayload };
    const error = new Error("inactive"); error.code = "FIREWALL_INACTIVE"; error.name = "FIREWALL_INACTIVE"; throw error;
  };
  const service = new FirewallService(helper);
  await assert.rejects(() => service.create({ name: "HTTPS", port: 443, protocol: "TCP", source: "0.0.0.0/0", idempotencyKey: crypto.randomUUID() }));
});

test("firewall service lets the same operation key retry after a helper failure", async () => {
  let calls = 0;
  const helper = async (request) => {
    calls += 1;
    if (calls === 1) { const error = new Error("timeout"); error.name = "FIREWALL_HELPER_TIMEOUT"; error.code = "FIREWALL_HELPER_TIMEOUT"; throw error; }
    return { ok: true, operation: request.operation, data: firewallPayload };
  };
  const service = new FirewallService(helper); const input = { name: "HTTPS", port: 443, protocol: "TCP", source: "0.0.0.0/0", idempotencyKey: crypto.randomUUID() };
  await assert.rejects(() => service.create(input)); assert.deepEqual(await service.create(input), firewallPayload); assert.equal(calls, 2);
});

test("firewall HTTP requires auth and one-time reauthentication for mutations", async () => {
  const database = openDatabase(":memory:"); const identity = new IdentityService(database, Buffer.alloc(32, 9)); const password = "correct horse battery staple";
  await identity.createInitialAdministrator("admin", "Administrator", password);
  const administrator = await identity.login("admin", password, "firewall-test-setup", "test");
  identity.upsertRole(administrator.principal, "firewall-operate-only", "Firewall Operate Only", "", ["firewall:operate"]);
  await identity.createUser(administrator.principal, "firewall-operator", "Firewall Operator", password, ["firewall-operate-only"], []);
  const config = loadControllerConfig({ STACKPILOT_COOKIE_SECURE: "0", STACKPILOT_ALLOWED_ORIGINS: "http://127.0.0.1:5173" });
  const services = createControllerServices(new FakePlatformAdapter(), process.cwd(), config, undefined, database); const calls = [];
  services.firewall = { async list() { calls.push(["list"]); return firewallPayload; }, async create(input) { calls.push(["create", input]); return firewallPayload; }, async delete(id, key) { calls.push(["delete", id, key]); return firewallPayload; } };
  const server = createStackPilotServer({ config, services, database, identity }); server.listen(0, "127.0.0.1"); await once(server, "listening"); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/firewall`)).status, 401);
    const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { Origin: "http://127.0.0.1:5173", "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password }) });
    const auth = await login.json(), cookie = login.headers.get("set-cookie").split(";")[0];
    const read = await fetch(`${base}/api/firewall`, { headers: { Cookie: cookie } }); assert.equal(read.status, 200); assert.equal(read.headers.get("cache-control"), "no-store");
    const rule = { name: "HTTPS", port: 443, protocol: "TCP", source: "0.0.0.0/0", idempotencyKey: crypto.randomUUID() };
    const headers = { Origin: "http://127.0.0.1:5173", Cookie: cookie, "X-CSRF-Token": auth.csrfToken, "Content-Type": "application/json" };
    assert.equal((await fetch(`${base}/api/firewall/rules`, { method: "POST", headers, body: JSON.stringify(rule) })).status, 403); assert.equal(calls.length, 1);
    const operatorLogin = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { Origin: "http://127.0.0.1:5173", "Content-Type": "application/json" }, body: JSON.stringify({ username: "firewall-operator", password }) });
    const operatorAuth = await operatorLogin.json(), operatorCookie = operatorLogin.headers.get("set-cookie").split(";")[0];
    const operatorHeaders = { Origin: "http://127.0.0.1:5173", Cookie: operatorCookie, "X-CSRF-Token": operatorAuth.csrfToken, "Content-Type": "application/json" };
    const operatorReauthResponse = await fetch(`${base}/api/auth/reauthenticate`, { method: "POST", headers: operatorHeaders, body: JSON.stringify({ password }) });
    const operatorReauth = await operatorReauthResponse.json();
    assert.equal((await fetch(`${base}/api/firewall/rules`, { method: "POST", headers: { ...operatorHeaders, "X-Reauth-Proof": operatorReauth.proof }, body: JSON.stringify(rule) })).status, 403);
    assert.equal(calls.length, 1);
    const reauthResponse = await fetch(`${base}/api/auth/reauthenticate`, { method: "POST", headers, body: JSON.stringify({ password }) }); const reauth = await reauthResponse.json();
    const created = await fetch(`${base}/api/firewall/rules`, { method: "POST", headers: { ...headers, "X-Reauth-Proof": reauth.proof }, body: JSON.stringify(rule) }); assert.equal(created.status, 201); assert.equal((await created.json()).message, "443/TCP 防火墙规则已新增");
    assert.equal((await fetch(`${base}/api/firewall/rules`, { method: "POST", headers: { ...headers, "X-Reauth-Proof": reauth.proof }, body: JSON.stringify(rule) })).status, 403);
  } finally { server.close(); await once(server, "close"); database.close(); }
});
