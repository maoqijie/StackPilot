import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import test from "node:test";
import { DatabaseBackupService } from "../../apps/controller/dist/modules/databases/databaseBackupService.js";
import { createControllerServices } from "../../apps/controller/dist/app.js";
import { loadControllerConfig } from "../../apps/controller/dist/config/environment.js";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { IdentityService } from "../../apps/controller/dist/identity/identityService.js";
import { createStackPilotServer } from "../../apps/controller/dist/server.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";

test("database backup service creates, verifies and drills a real isolated SQLite backup", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-backups-"));
  const databasePath = join(root, "state", "stackpilot.sqlite3");
  const backupRoot = join(root, "backups");
  const database = openDatabase(databasePath);
  const service = new DatabaseBackupService(database, databasePath, loadControllerConfig({ STACKPILOT_BACKUP_DIRS: backupRoot }), root);
  try {
    const before = await service.snapshot();
    assert.equal(before.source.schemaVersion, 4);
    assert.equal(before.backups.length, 0);
    assert.match(JSON.stringify(before), /backups/);
    assert.doesNotMatch(JSON.stringify(before), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const created = await service.create("database-backup-test-1");
    assert.equal(created.checksumStatus, "pending");
    assert.equal((await service.create("database-backup-test-1")).id, created.id);
    assert.equal((await service.snapshot()).backups.length, 1);

    const verified = await service.verify(created.id);
    assert.equal(verified.checksumStatus, "verified");
    assert.match(await readFile(join(backupRoot, `${created.fileName}.sha256`), "utf8"), /^[a-f0-9]{64}  /);

    const drilled = await service.drill(created.id);
    assert.equal(drilled.drillStatus, "succeeded");
    assert.ok(drilled.drilledAt);

    await symlink(join(backupRoot, created.fileName), join(backupRoot, "linked.sqlite3"));
    assert.equal((await service.snapshot()).backups.length, 1);
  } finally {
    database.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("database backup service reports not ready without a live Controller database", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-backups-not-ready-"));
  try {
    const service = new DatabaseBackupService(null, join(root, "missing.sqlite3"), loadControllerConfig({}), root);
    await assert.rejects(() => service.snapshot(), /尚未就绪/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("database backup HTTP API enforces backup permission and reauthentication", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-backups-http-"));
  const databasePath = join(root, "state", "stackpilot.sqlite3");
  const backupRoot = join(root, "backups");
  const database = openDatabase(databasePath);
  const identity = new IdentityService(database, Buffer.alloc(32, 7));
  await identity.createInitialAdministrator("admin", "Administrator", "correct horse battery staple");
  const config = loadControllerConfig({
    STACKPILOT_DATABASE_PATH: databasePath,
    STACKPILOT_BACKUP_DIRS: backupRoot,
    STACKPILOT_COOKIE_SECURE: "0",
    STACKPILOT_ALLOWED_ORIGINS: "http://127.0.0.1:5173",
  });
  const services = createControllerServices(new FakePlatformAdapter(), root, config, undefined, database);
  const administrator = (await identity.login("admin", "correct horse battery staple", "test", "ua")).principal;
  const readOnlyToken = identity.createApiToken(administrator, { name: "overview", permissions: ["overview:read"], nodeScope: [], expiresAt: null }).token;
  const backupToken = identity.createApiToken(administrator, { name: "backup", permissions: ["system:backup"], nodeScope: [], expiresAt: null }).token;
  const server = createStackPilotServer({ config, services, database, identity });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/database-backups`)).status, 401);
    assert.equal((await fetch(`${base}/api/database-backups`, { headers: { Authorization: `Bearer ${readOnlyToken}` } })).status, 403);
    const allowed = await fetch(`${base}/api/database-backups`, { headers: { Authorization: `Bearer ${backupToken}` } });
    assert.equal(allowed.status, 200);
    assert.doesNotMatch(JSON.stringify(await allowed.json()), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:5173", "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "correct horse battery staple" }),
    });
    const loginBody = await login.json();
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const writeHeaders = { Origin: "http://127.0.0.1:5173", Cookie: cookie, "X-CSRF-Token": loginBody.csrfToken, "Content-Type": "application/json" };
    const body = JSON.stringify({ idempotencyKey: "http-backup-test-1" });
    assert.equal((await fetch(`${base}/api/database-backups`, { method: "POST", headers: writeHeaders, body })).status, 403);
    const reauth = await (await fetch(`${base}/api/auth/reauthenticate`, { method: "POST", headers: writeHeaders, body: JSON.stringify({ password: "correct horse battery staple" }) })).json();
    const created = await fetch(`${base}/api/database-backups`, { method: "POST", headers: { ...writeHeaders, "X-Reauth-Proof": reauth.proof }, body });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).backup.checksumStatus, "pending");
  } finally {
    server.close();
    await once(server, "close");
    database.close();
    await rm(root, { recursive: true, force: true });
  }
});
