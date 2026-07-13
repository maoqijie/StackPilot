import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { DatabaseSlowQueryService } from "../../apps/controller/dist/modules/databases/databaseSlowQueryService.js";
import { PostgresSlowQueryCollector, normalizeSql } from "../../apps/controller/dist/platform/postgresSlowQueryCollector.js";
import { createControllerServices } from "../../apps/controller/dist/app.js";
import { loadControllerConfig } from "../../apps/controller/dist/config/environment.js";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { IdentityService } from "../../apps/controller/dist/identity/identityService.js";
import { createStackPilotServer } from "../../apps/controller/dist/server.js";
import { MemoryAgentControlRepository } from "../../apps/controller/dist/repositories/agentControlRepository.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";

const now = "2026-07-14T00:00:00.000Z";
const snapshot = {
  version: "16.9", port: 5432, databases: [{ name: "orders", connections: 4 }],
  queries: [{ pid: 91, database: "orders", owner: "reporter", sql: "SELECT * FROM users WHERE email = 'private@example.com' AND id = 42", durationMs: 31_250, startedAt: now, queryId: "-123", waitEventType: null, waitEvent: null }],
};

test("PostgreSQL collector normalizes literals and returns real activity fields", async () => {
  const calls = [];
  const collector = new PostgresSlowQueryCollector(async (executable, args, options) => {
    calls.push({ executable, args, options });
    return { ok: true, stdout: JSON.stringify(snapshot), stderr: "", elapsedMs: 1 };
  });
  const payload = await collector.collect();
  assert.equal(payload.collectionStatus, "complete");
  assert.equal(payload.instances[0].activeConnections, 4);
  assert.equal(payload.instances[0].slowQueryCount, 1);
  assert.equal(payload.queries[0].durationMs, 31_250);
  assert.equal(payload.queries[0].risk, "high");
  assert.equal(payload.queries[0].p95Ms, null);
  assert.equal(payload.queries[0].calls, null);
  assert.doesNotMatch(payload.queries[0].sql, /private@example|42/);
  assert.equal(calls[0].executable, "/usr/bin/psql");
  assert.equal(calls[0].options.timeoutMs, 3_000);
  assert.ok(calls[0].args.includes("ON_ERROR_STOP=1"));
});

test("PostgreSQL collector reports unavailable without leaking command errors", async () => {
  const collector = new PostgresSlowQueryCollector(async () => ({ ok: false, stdout: "", stderr: "password=secret", elapsedMs: 1 }));
  const payload = await collector.collect();
  assert.equal(payload.collectionStatus, "unavailable");
  assert.deepEqual(payload.instances, []);
  assert.doesNotMatch(JSON.stringify(payload), /secret/);
});

test("slow-query service deduplicates and caches collection", async () => {
  let calls = 0;
  const payload = { collectedAt: now, collectionStatus: "complete", warnings: [], thresholdMs: 1_000, instances: [], queries: [] };
  const service = new DatabaseSlowQueryService({ collect: async () => { calls += 1; return payload; } }, 60_000);
  const [first, second] = await Promise.all([service.getSlowQueries(), service.getSlowQueries()]);
  assert.equal(first, payload); assert.equal(second, payload); await service.getSlowQueries(); assert.equal(calls, 1);
});

test("slow-query API requires database read permission", async () => {
  const database = openDatabase(":memory:"); const identity = new IdentityService(database, Buffer.alloc(32, 4));
  await identity.createInitialAdministrator("admin", "Administrator", "correct horse battery staple");
  const admin = (await identity.login("admin", "correct horse battery staple", "test", "ua")).principal;
  const services = createControllerServices(new FakePlatformAdapter(), process.cwd(), loadControllerConfig({}), new MemoryAgentControlRepository());
  services.databases = new DatabaseSlowQueryService({ collect: async () => ({ collectedAt: now, collectionStatus: "complete", warnings: [], thresholdMs: 1_000, instances: [], queries: [] }) });
  const readToken = identity.createApiToken(admin, { name: "read", permissions: ["databases:read"], nodeScope: [], expiresAt: null }).token;
  const deniedToken = identity.createApiToken(admin, { name: "denied", permissions: ["overview:read"], nodeScope: [], expiresAt: null }).token;
  const server = createStackPilotServer({ env: { STACKPILOT_COOKIE_SECURE: "0" }, services, database, identity });
  server.listen(0, "127.0.0.1"); await once(server, "listening"); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/databases/slow-queries`)).status, 401);
    assert.equal((await fetch(`${base}/api/databases/slow-queries`, { headers: { Authorization: `Bearer ${deniedToken}` } })).status, 403);
    const response = await fetch(`${base}/api/databases/slow-queries`, { headers: { Authorization: `Bearer ${readToken}` } });
    assert.equal(response.status, 200); assert.equal((await response.json()).collectionStatus, "complete");
  } finally { server.close(); await once(server, "close"); database.close(); }
});

test("SQL normalization removes common literal and comment forms", () => {
  assert.equal(normalizeSql("SELECT 123, 4.5, 'secret', $$hidden$$ /* token abc */ -- password xyz"), "SELECT ?, ?, '?', $tag$?$tag$");
});
