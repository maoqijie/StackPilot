import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { IdentityService } from "../../apps/controller/dist/identity/identityService.js";
import { createStackPilotServer } from "../../apps/controller/dist/server.js";
import { AuditExportService } from "../../apps/controller/dist/modules/audit/auditExportService.js";
import { createMemoryLogger } from "../../apps/controller/dist/logging/logger.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";

const password = "correct horse battery staple";
const origin = "http://127.0.0.1:5173";

test("audit export creates and downloads a persistent real snapshot", async () => {
  const directory = join(tmpdir(), `stackpilot-audit-export-${crypto.randomUUID()}`);
  const database = openDatabase(":memory:");
  const identity = new IdentityService(database, Buffer.alloc(32, 9));
  await identity.createInitialAdministrator("admin", "Administrator", password);
  identity.audit.append({ actorType: "user", actorId: "admin", sessionId: "session-correlation", source: "=formula-source", action: "test.audit", parameters: { password: "must-not-leak", label: "hello" }, outcome: "success", authorization: "allowed:test", requestId: crypto.randomUUID() });
  const server = createStackPilotServer({ env: { STACKPILOT_COOKIE_SECURE: "0", STACKPILOT_ALLOWED_ORIGINS: origin, STACKPILOT_AUDIT_EXPORT_DIR: directory }, database, identity, platform: new FakePlatformAdapter() });
  server.listen(0, "127.0.0.1"); await once(server, "listening"); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password }) });
    const auth = await login.json(); const cookie = login.headers.get("set-cookie").split(";")[0];
    const reauth = async () => (await (await fetch(`${base}/api/auth/reauthenticate`, { method: "POST", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json", "X-CSRF-Token": auth.csrfToken }, body: JSON.stringify({ password }) })).json()).proof;
    const unauthenticated = await fetch(`${base}/api/audit-exports`); assert.equal(unauthenticated.status, 401);
    const created = await fetch(`${base}/api/audit-exports`, { method: "POST", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json", "X-CSRF-Token": auth.csrfToken, "X-Reauth-Proof": await reauth() }, body: JSON.stringify({ name: "真实审计", format: "csv" }) });
    assert.equal(created.status, 201); const record = (await created.json()).export; assert.equal(record.status, "ready"); assert.ok(record.rowCount >= 2); assert.match(record.sha256, /^[0-9a-f]{64}$/);
    const listed = await (await fetch(`${base}/api/audit-exports`, { headers: { Cookie: cookie } })).json(); assert.equal(listed.exports[0].id, record.id); assert.ok(Date.parse(listed.collectedAt));
    const downloaded = await fetch(`${base}/api/audit-exports/${record.id}/download`, { method: "POST", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json", "X-CSRF-Token": auth.csrfToken, "X-Reauth-Proof": await reauth() }, body: "{}" });
    assert.equal(downloaded.status, 200); assert.match(downloaded.headers.get("content-disposition"), /attachment/); assert.equal(downloaded.headers.get("cache-control"), "private, no-store");
    const downloadedBytes = Buffer.from(await downloaded.arrayBuffer()); const csv = downloadedBytes.toString(); assert.match(csv, /test\.audit/); assert.match(csv, /session-correlation/); assert.match(csv, /allowed:test/); assert.match(csv, /'\=formula-source/); assert.doesNotMatch(csv, /must-not-leak/); assert.match(csv, /\[REDACTED\]/);
    assert.deepEqual(await readFile(join(directory, `${record.id}.csv`)), downloadedBytes);
  } finally { server.close(); await once(server, "close"); database.close(); await rm(directory, { recursive: true, force: true }); }
});

test("audit export rejects audit readers, API tokens and scoped sessions", async () => {
  const database = openDatabase(":memory:"); const identity = new IdentityService(database, Buffer.alloc(32, 7));
  await identity.createInitialAdministrator("admin", "Administrator", password); const admin = (await identity.login("admin", password, "admin", "ua")).principal;
  const scopedId = await identity.createUser(admin, "scoped", "Scoped", password, ["administrator"], "all");
  database.prepare("DELETE FROM user_roles WHERE user_id=?").run(scopedId); identity.upsertRole(admin, "scoped-export", "Scoped Export", "", ["audit:read", "audit:export"]); database.prepare("INSERT INTO user_roles(user_id,role_id) VALUES(?,?)").run(scopedId, "scoped-export"); database.prepare("INSERT INTO user_node_scopes(user_id,node_id) VALUES(?,?)").run(scopedId, "11111111-1111-4111-8111-111111111111");
  const token = identity.createApiToken(admin, { name: "export-token", permissions: ["audit:export"], nodeScope: "all", expiresAt: null });
  const readerToken = identity.createApiToken(admin, { name: "reader-token", permissions: ["audit:read"], nodeScope: "all", expiresAt: null });
  await identity.createUser(admin, "export-only", "Export Only", password, ["administrator"], "all");
  database.prepare("DELETE FROM role_permissions WHERE role_id='administrator'").run();
  database.prepare("INSERT INTO role_permissions(role_id,permission_key) VALUES('administrator','audit:export')").run();
  const server = createStackPilotServer({ env: { STACKPILOT_COOKIE_SECURE: "0", STACKPILOT_ALLOWED_ORIGINS: origin }, database, identity, platform: new FakePlatformAdapter() }); server.listen(0, "127.0.0.1"); await once(server, "listening"); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/audit-exports`, { headers: { Authorization: `Bearer ${token.token}` } })).status, 404);
    assert.equal((await fetch(`${base}/api/audit-exports`, { headers: { Authorization: `Bearer ${readerToken.token}` } })).status, 404);
    const exportOnly = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ username: "export-only", password }) });
    assert.equal((await fetch(`${base}/api/audit-exports`, { headers: { Cookie: exportOnly.headers.get("set-cookie").split(";")[0] } })).status, 403);
    const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ username: "scoped", password }) });
    assert.equal((await fetch(`${base}/api/audit-exports`, { headers: { Cookie: login.headers.get("set-cookie").split(";")[0] } })).status, 404);
  } finally { server.close(); await once(server, "close"); database.close(); }
});

test("audit export enforces per-user rate limits and removes orphan files during maintenance", async () => {
  const directory = join(tmpdir(), `stackpilot-audit-export-maintenance-${crypto.randomUUID()}`);
  const database = openDatabase(":memory:"); const identity = new IdentityService(database, Buffer.alloc(32, 5));
  await identity.createInitialAdministrator("admin", "Administrator", password);
  const user = database.prepare("SELECT id,display_name AS displayName FROM users WHERE username='admin'").get();
  const service = new AuditExportService(database, identity.audit, directory);
  try {
    await service.create({ name: "first", format: "json" }, { userId: user.id, displayName: user.displayName }, crypto.randomUUID());
    await assert.rejects(service.create({ name: "second", format: "json" }, { userId: user.id, displayName: user.displayName }, crypto.randomUUID()), /创建过于频繁/);
    await writeFile(join(directory, `${crypto.randomUUID()}.csv`), "orphan");
    await service.runMaintenance();
    const names = await import("node:fs/promises").then(({ readdir }) => readdir(directory));
    assert.equal(names.some((name) => name.endsWith(".csv")), false);
  } finally { service.shutdown(); database.close(); await rm(directory, { recursive: true, force: true }); }
});

test("failed audit exports can be retried immediately without self-rate-limiting", async () => {
  const directory = join(tmpdir(), `stackpilot-audit-export-retry-${crypto.randomUUID()}`);
  const database = openDatabase(":memory:"); const identity = new IdentityService(database, Buffer.alloc(32, 4));
  await identity.createInitialAdministrator("admin", "Administrator", password);
  const user = database.prepare("SELECT id,display_name AS displayName FROM users WHERE username='admin'").get();
  const service = new AuditExportService(database, identity.audit, directory);
  try {
    await service.runMaintenance();
    const id = crypto.randomUUID(), now = new Date().toISOString();
    database.prepare(`INSERT INTO audit_exports(export_id,name,format,status,row_count,size_bytes,storage_name,sha256,creator_user_id,creator_display_name,created_at,completed_at,expires_at,trace_id,error_code,source_max_sequence)
      VALUES(?,?,'json','failed',0,0,NULL,NULL,?,?,?,?,?,?,'GENERATION_FAILED',0)`).run(id, "retry-now", user.id, user.displayName, now, now, new Date(Date.now() + 60_000).toISOString(), crypto.randomUUID());
    const retried = await service.retry(id, user.id, true, { userId: user.id, displayName: user.displayName }, crypto.randomUUID());
    assert.equal(retried.status, "ready");
  } finally { service.shutdown(); database.close(); await rm(directory, { recursive: true, force: true }); }
});

test("audit export maintenance logs filesystem failures and remains retryable", async () => {
  const directory = join(tmpdir(), `stackpilot-audit-export-maintenance-error-${crypto.randomUUID()}`);
  await writeFile(directory, "not-a-directory");
  const database = openDatabase(":memory:"); const identity = new IdentityService(database, Buffer.alloc(32, 3)); const logger = createMemoryLogger();
  await identity.createInitialAdministrator("admin", "Administrator", password);
  const service = new AuditExportService(database, identity.audit, directory, logger);
  try {
    await assert.rejects(service.runMaintenance());
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(logger.records.some((record) => record.message.includes("审计导出维护失败")), true);
    await rm(directory, { force: true }); await service.runMaintenance();
  } finally { service.shutdown(); database.close(); await rm(directory, { recursive: true, force: true }); }
});

test("audit snapshot generation yields while processing a larger real chain", async () => {
  const directory = join(tmpdir(), `stackpilot-audit-export-yield-${crypto.randomUUID()}`);
  const database = openDatabase(":memory:"); const identity = new IdentityService(database, Buffer.alloc(32, 2));
  await identity.createInitialAdministrator("admin", "Administrator", password);
  for (let index = 0; index < 750; index++) identity.audit.append({ actorType: "system", source: "yield-test", action: `event.${index}`, parameters: { value: "x".repeat(512) }, outcome: "success", authorization: "system", requestId: crypto.randomUUID() });
  const user = database.prepare("SELECT id,display_name AS displayName FROM users WHERE username='admin'").get();
  const service = new AuditExportService(database, identity.audit, directory);
  try {
    let yielded = false; setImmediate(() => { yielded = true; });
    const record = await service.create({ name: "yield", format: "csv" }, { userId: user.id, displayName: user.displayName }, crypto.randomUUID());
    assert.equal(record.status, "ready"); assert.equal(yielded, true);
  } finally { service.shutdown(); database.close(); await rm(directory, { recursive: true, force: true }); }
});
