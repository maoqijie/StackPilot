import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createControllerServices } from "../../apps/controller/dist/app.js";
import { loadControllerConfig } from "../../apps/controller/dist/config/environment.js";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { IdentityService } from "../../apps/controller/dist/identity/identityService.js";
import { FirewallOpenPortService, parseListeningSockets } from "../../apps/controller/dist/modules/firewall/firewallOpenPortService.js";
import { createStackPilotServer } from "../../apps/controller/dist/server.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";

const collectedAt = "2026-07-15T06:00:00.000Z";

test("socket parser classifies real bind addresses and emits stable identifiers", () => {
  const input = [
    "tcp LISTEN 0 511 0.0.0.0:443 0.0.0.0:*",
    "tcp LISTEN 0 128 127.0.0.1:18787 0.0.0.0:*",
    "udp UNCONN 0 0 10.0.0.8:53 0.0.0.0:*",
    "tcp LISTEN 0 511 [::]:80 [::]:*",
    "tcp LISTEN 0 511 [::1]:6379 [::]:*",
  ].join("\n");
  const first = parseListeningSockets(input, "prod-controller");
  const second = parseListeningSockets(input, "prod-controller");
  assert.deepEqual(first, second);
  assert.deepEqual(first.map((row) => [row.port, row.exposure]), [[53, "private"], [80, "public"], [443, "public"], [6379, "loopback"], [18787, "loopback"]]);
  assert.match(first[0].id, /^port_[a-f0-9]{24}$/);
});

test("collector marks probe failures unavailable without fixture rows", async () => {
  const payload = await new FirewallOpenPortService(async () => { throw new Error("ss unavailable"); }, "prod-controller").list();
  assert.equal(payload.collectionStatus, "unavailable");
  assert.deepEqual(payload.ports, []);
  assert.match(payload.warnings[0], /暂不可用/);
});

test("firewall open-port route requires permission and returns backend collection time", async () => {
  const database = openDatabase(":memory:");
  const identity = new IdentityService(database, Buffer.alloc(32, 6));
  await identity.createInitialAdministrator("admin", "Administrator", "correct horse battery staple");
  const login = await identity.login("admin", "correct horse battery staple", "test", "node-test");
  const token = identity.createApiToken(login.principal, { name: "firewall-read", permissions: ["firewall:read"], nodeScope: "all", expiresAt: null }).token;
  const services = createControllerServices(new FakePlatformAdapter(), process.cwd(), loadControllerConfig({}), undefined, database);
  services.firewallOpenPorts = { async list() { return { collectedAt, collectionStatus: "complete", backend: "ss", warnings: [], ports: [] }; } };
  const server = createStackPilotServer({ env: { STACKPILOT_COOKIE_SECURE: "0" }, platform: new FakePlatformAdapter(), database, identity, services });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/firewall/open-ports`)).status, 401);
    const response = await fetch(`${base}/api/firewall/open-ports`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).collectedAt, collectedAt);
  } finally { server.close(); await once(server, "close"); database.close(); }
});
