import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import test from "node:test";
import { FileService } from "../../apps/controller/dist/modules/files/fileService.js";
import { createControllerServices } from "../../apps/controller/dist/app.js";
import { createStackPilotServer } from "../../apps/controller/dist/server.js";
import { loadControllerConfig } from "../../apps/controller/dist/config/environment.js";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { IdentityService } from "../../apps/controller/dist/identity/identityService.js";
import { MemoryAgentControlRepository } from "../../apps/controller/dist/repositories/agentControlRepository.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";

test("file service constrains paths, skips symlinks and restores real bytes", async () => {
  const work = await mkdtemp(join(tmpdir(), "stackpilot-files-")); const root = join(work, "root"); const trash = join(work, "trash"); await mkdir(root); await writeFile(join(root, "hello.txt"), "real bytes"); await symlink(tmpdir(), join(root, "escape")); const service = new FileService(root, trash, 1024, work);
  try {
    const listed = await service.list("/"); assert.deepEqual(listed.entries.map((entry) => entry.name), ["hello.txt"]); await assert.rejects(service.list("/../"), /路径|不存在/); await assert.rejects(service.list("/escape"), /符号链接/);
    const trashed = await service.trash("/hello.txt"); assert.equal((await service.list("/")).entries.length, 0); await service.restore(trashed.id); assert.equal(await readFile(join(root, "hello.txt"), "utf8"), "real bytes");
    await service.upload("/", "uploaded.bin", (async function* () { yield Buffer.from([0, 1, 2, 3]); })(), "tester"); assert.deepEqual([...await readFile(join(root, "uploaded.bin"))], [0, 1, 2, 3]);
  } finally { await rm(work, { recursive: true, force: true }); }
});

test("file mutations serialize concurrent targets and metadata updates", async () => {
  const work = await mkdtemp(join(tmpdir(), "stackpilot-files-race-")); const root = join(work, "root"); const trash = join(work, "trash"); await mkdir(root); await writeFile(join(root, "a.txt"), "A"); await writeFile(join(root, "b.txt"), "B"); const service = new FileService(root, trash, 1024, work);
  try {
    const renames = await Promise.allSettled([service.rename("/a.txt", "target.txt"), service.rename("/b.txt", "target.txt")]); assert.equal(renames.filter((result) => result.status === "fulfilled").length, 1); assert.equal(renames.filter((result) => result.status === "rejected").length, 1);
    const remaining = (await service.list("/")).entries.filter((entry) => entry.name !== "target.txt"); assert.equal(remaining.length, 1);
    await writeFile(join(root, "trash-a.txt"), "trash A"); await writeFile(join(root, "trash-b.txt"), "trash B"); await Promise.all([service.trash("/trash-a.txt"), service.trash("/trash-b.txt")]); assert.equal((await service.listTrash()).entries.length, 2);
    const uploads = await Promise.allSettled([service.upload("/", "same.bin", (async function* () { yield "first"; })(), "one"), service.upload("/", "same.bin", (async function* () { yield "second"; })(), "two")]); assert.equal(uploads.filter((result) => result.status === "fulfilled").length, 1); assert.equal(uploads.filter((result) => result.status === "rejected").length, 1); assert.equal((await service.listUploads()).uploads.length, 1); assert.equal((await readdir(root)).some((name) => name.startsWith(".stackpilot-upload-")), false);
  } finally { await rm(work, { recursive: true, force: true }); }
});

test("file storage rejects overlapping roots and untrusted trash metadata", async () => {
  const work = await mkdtemp(join(tmpdir(), "stackpilot-files-metadata-")); const root = join(work, "root"); const trash = join(work, "trash"); await mkdir(root); await mkdir(trash);
  try {
    assert.throws(() => new FileService(root, root, 1024, work), /隔离/);
    await writeFile(join(trash, ".stackpilot-trash.json"), JSON.stringify([{ id: "11111111-1111-4111-8111-111111111111", name: "bad", originalPath: "/bad", kind: "file", sizeBytes: 1, deletedAt: new Date().toISOString(), expiresAt: new Date().toISOString(), owner: "uid:1", storedName: "../../outside" }]));
    await assert.rejects(new FileService(root, trash, 1024, work).listTrash(), /元数据损坏/);
  } finally { await rm(work, { recursive: true, force: true }); }
});

test("file HTTP endpoints enforce permissions and persist uploaded bytes", async () => {
  const work = await mkdtemp(join(tmpdir(), "stackpilot-files-http-")); const root = join(work, "root"); const trash = join(work, "trash"); await mkdir(root); const database = openDatabase(":memory:"); const identity = new IdentityService(database, Buffer.alloc(32, 6)); await identity.createInitialAdministrator("admin", "Administrator", "correct horse battery staple"); const admin = (await identity.login("admin", "correct horse battery staple", "test", "ua")).principal;
  const readToken = identity.createApiToken(admin, { name: "read", permissions: ["files:read"], nodeScope: [], expiresAt: null }).token; const writeToken = identity.createApiToken(admin, { name: "write", permissions: ["files:read", "files:write"], nodeScope: [], expiresAt: null }).token;
  const config = loadControllerConfig({ STACKPILOT_COOKIE_SECURE: "0", STACKPILOT_FILE_ROOT: root, STACKPILOT_FILE_TRASH_DIR: trash, STACKPILOT_FILE_UPLOAD_LIMIT_BYTES: "1024" }); const services = createControllerServices(new FakePlatformAdapter(), work, config, new MemoryAgentControlRepository()); const server = createStackPilotServer({ config, services, database, identity }); server.listen(0, "127.0.0.1"); await once(server, "listening"); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/files?path=%2F`)).status, 401); const empty = await fetch(`${base}/api/files?path=%2F`, { headers: { Authorization: `Bearer ${readToken}` } }); assert.equal(empty.status, 200); assert.deepEqual((await empty.json()).entries, []);
    assert.equal((await fetch(`${base}/api/file-uploads`, { method: "POST", headers: { Authorization: `Bearer ${readToken}`, "Content-Type": "application/octet-stream", "X-File-Name": "file.txt", "X-File-Target-Path": "%2F" }, body: "payload" })).status, 403);
    const uploaded = await fetch(`${base}/api/file-uploads`, { method: "POST", headers: { Authorization: `Bearer ${writeToken}`, "Content-Type": "application/octet-stream", "X-File-Name": "file.txt", "X-File-Target-Path": "%2F" }, body: "payload" }); assert.equal(uploaded.status, 201); assert.equal(await readFile(join(root, "file.txt"), "utf8"), "payload");
    const trashed = await fetch(`${base}/api/files/trash`, { method: "POST", headers: { Authorization: `Bearer ${writeToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ path: "/file.txt" }) }); assert.equal(trashed.status, 200); assert.equal((await trashed.json()).trashEntry.name, "file.txt");
  } finally { server.close(); await once(server, "close"); database.close(); await rm(work, { recursive: true, force: true }); }
});

test("permanent deletion requires an explicit valid target", async () => {
  const work = await mkdtemp(join(tmpdir(), "stackpilot-files-delete-")); const root = join(work, "root"); const trash = join(work, "trash"); await mkdir(root); await writeFile(join(root, "one.txt"), "one"); await writeFile(join(root, "two.txt"), "two"); const database = openDatabase(":memory:"); const identity = new IdentityService(database, Buffer.alloc(32, 7)); const password = "correct horse battery staple"; await identity.createInitialAdministrator("admin", "Administrator", password);
  const config = loadControllerConfig({ STACKPILOT_COOKIE_SECURE: "0", STACKPILOT_FILE_ROOT: root, STACKPILOT_FILE_TRASH_DIR: trash }); const services = createControllerServices(new FakePlatformAdapter(), work, config, new MemoryAgentControlRepository()); await services.files.trash("/one.txt"); await services.files.trash("/two.txt"); const server = createStackPilotServer({ config, services, database, identity }); server.listen(0, "127.0.0.1"); await once(server, "listening"); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { Origin: "http://127.0.0.1:5173", "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password }) }); const loginBody = await login.json(); const cookie = login.headers.get("set-cookie").split(";")[0];
    const reauthenticate = async () => { const response = await fetch(`${base}/api/auth/reauthenticate`, { method: "POST", headers: { Origin: "http://127.0.0.1:5173", Cookie: cookie, "X-CSRF-Token": loginBody.csrfToken, "Content-Type": "application/json" }, body: JSON.stringify({ password }) }); return (await response.json()).proof; };
    const request = async (body, proof) => fetch(`${base}/api/file-trash`, { method: "DELETE", headers: { Origin: "http://127.0.0.1:5173", Cookie: cookie, "X-CSRF-Token": loginBody.csrfToken, "X-Reauth-Proof": proof, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await request({ id: "invalid" }, await reauthenticate())).status, 400); assert.equal((await services.files.listTrash()).entries.length, 2);
    assert.equal((await request({ empty: true }, await reauthenticate())).status, 200); assert.equal((await services.files.listTrash()).entries.length, 0);
  } finally { server.close(); await once(server, "close"); database.close(); await rm(work, { recursive: true, force: true }); }
});
