import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import test from "node:test";
import { NginxSiteCollector } from "../../apps/controller/dist/platform/siteCollector.js";
import { SiteMonitoringService } from "../../apps/controller/dist/modules/sites/siteMonitoringService.js";
import { createControllerServices } from "../../apps/controller/dist/app.js";
import { createStackPilotServer } from "../../apps/controller/dist/server.js";
import { loadControllerConfig } from "../../apps/controller/dist/config/environment.js";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { IdentityService } from "../../apps/controller/dist/identity/identityService.js";
import { MemoryAgentControlRepository } from "../../apps/controller/dist/repositories/agentControlRepository.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";

const collectedAt = "2026-07-13T00:00:00.000Z";
const probe = async (_domain, listeners) => ({
  status: listeners.some((listener) => listener.secure) ? "running" : "warning",
  latencyMs: 12,
  certificateExpiresAt: listeners.some((listener) => listener.secure) ? "2026-09-01T00:00:00.000Z" : null,
  certificateIssuer: listeners.some((listener) => listener.secure) ? "Test CA" : null,
});

test("Nginx site collector discovers, merges and probes real virtual hosts without fixtures", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-sites-"));
  try {
    await writeFile(join(root, "sites.conf"), `
      server { listen 80; server_name app.example.com; proxy_pass http://127.0.0.1:3000/private?token=hidden; }
      server { listen 443 ssl; server_name app.example.com docs.example.com; root /srv/www; }
      server { listen 80; server_name dynamic.example.com; proxy_pass http://$backend/private; }
      server { listen 80; server_name dashboard.example.com; root /var/www/acme; }
      server { listen 443 ssl; server_name dashboard.example.com; proxy_pass http://127.0.0.1:9191; }
      server { listen 80; server_name _ $host ~^regex; }
    `);
    await writeFile(join(root, "stale.conf.bak"), "server { listen 80; server_name stale.example.com; }");
    const payload = await new NginxSiteCollector([root], probe, "controller-1").collectSites();
    assert.equal(payload.collectionStatus, "complete");
    assert.deepEqual(payload.sites.map((site) => site.domain), ["app.example.com", "dashboard.example.com", "docs.example.com", "dynamic.example.com"]);
    assert.equal(payload.sites[0].status, "running");
    assert.equal(payload.sites[0].upstream, "http://127.0.0.1:3000/private");
    assert.equal(payload.sites[0].certificateIssuer, "Test CA");
    assert.equal(payload.sites[1].runtime, "反向代理");
    assert.equal(payload.sites[1].upstream, "http://127.0.0.1:9191");
    assert.equal(payload.sites[2].runtime, "Nginx 静态");
    assert.equal(payload.sites[2].host, "controller-1");
    assert.equal(payload.sites[2].trafficBytes, null);
    assert.equal(payload.sites[3].upstream, "动态上游");
    assert.equal(payload.sites.some((site) => site.domain === "stale.example.com"), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Nginx site collector reports unavailable sources instead of demo sites", async () => {
  const payload = await new NginxSiteCollector([join(tmpdir(), "stackpilot-missing-sites")], probe).collectSites();
  assert.equal(payload.collectionStatus, "unavailable");
  assert.deepEqual(payload.sites, []);
  assert.equal(payload.warnings.length, 1);
});

test("site monitoring service coalesces and caches collection", async () => {
  let calls = 0;
  const collector = { collectSites: async () => { calls += 1; return { collectedAt, collectionStatus: "complete", warnings: [], sites: [] }; } };
  const service = new SiteMonitoringService(collector, 10_000);
  await Promise.all([service.getSites(), service.getSites()]);
  await service.getSites();
  assert.equal(calls, 1);
});

test("GET /api/sites requires overview read and returns the contracted payload", async () => {
  const database = openDatabase(":memory:");
  const identity = new IdentityService(database, Buffer.alloc(32, 5));
  await identity.createInitialAdministrator("admin", "Administrator", "correct horse battery staple");
  const admin = (await identity.login("admin", "correct horse battery staple", "test", "ua")).principal;
  const services = createControllerServices(new FakePlatformAdapter(), process.cwd(), loadControllerConfig({}), new MemoryAgentControlRepository());
  services.sites = new SiteMonitoringService({ collectSites: async () => ({ collectedAt, collectionStatus: "partial", warnings: ["one unreadable config"], sites: [] }) });
  const overviewToken = identity.createApiToken(admin, { name: "overview", permissions: ["overview:read"], nodeScope: [], expiresAt: null }).token;
  const nodesToken = identity.createApiToken(admin, { name: "nodes", permissions: ["nodes:read"], nodeScope: "all", expiresAt: null }).token;
  const server = createStackPilotServer({ env: { STACKPILOT_COOKIE_SECURE: "0" }, services, database, identity });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/sites`)).status, 401);
    assert.equal((await fetch(`${base}/api/sites`, { headers: { Authorization: `Bearer ${nodesToken}` } })).status, 403);
    const response = await fetch(`${base}/api/sites`, { headers: { Authorization: `Bearer ${overviewToken}` } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { collectedAt, collectionStatus: "partial", warnings: ["one unreadable config"], sites: [] });
  } finally { server.close(); await once(server, "close"); database.close(); }
});
