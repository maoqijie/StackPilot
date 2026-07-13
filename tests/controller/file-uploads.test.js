import assert from "node:assert/strict";
import { once } from "node:events";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createStackPilotServer } from "../../apps/controller/dist/server.js";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { IdentityService } from "../../apps/controller/dist/identity/identityService.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";

const origin = "http://127.0.0.1:5173";
const password = "correct horse battery staple";

async function fixture(callback) {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-upload-"));
  const database = openDatabase(join(root, "stackpilot.sqlite3"));
  const identity = new IdentityService(database, Buffer.alloc(32, 4));
  await identity.createInitialAdministrator("admin", "Administrator", password);
  const server = createStackPilotServer({
    env: { STACKPILOT_COOKIE_SECURE: "0", STACKPILOT_ALLOWED_ORIGINS: origin, STACKPILOT_UPLOAD_ROOT: join(root, "uploads"), STACKPILOT_UPLOAD_MAX_BYTES: "32", STACKPILOT_UPLOAD_CHUNK_MAX_BYTES: "8" },
    database, identity, platform: new FakePlatformAdapter(),
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try { await callback(`http://127.0.0.1:${server.address().port}`, { root, database, identity }); }
  finally { server.close(); await once(server, "close"); database.close(); await rm(root, { recursive: true, force: true }); }
}

async function session(base) {
  const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password }) });
  const body = await response.json();
  return { Cookie: response.headers.get("set-cookie").split(";")[0], Origin: origin, "X-CSRF-Token": body.csrfToken };
}

async function createUpload(base, headers, overrides = {}) {
  return fetch(`${base}/api/resumable-file-uploads`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ fileName: "artifact.txt", targetDirectory: "releases", sizeBytes: 11, contentType: "text/plain", idempotencyKey: "upload-case-001", ...overrides }) });
}

test("file upload HTTP flow streams exact chunks, persists progress and publishes without overwrite", async () => fixture(async (base, { root, database }) => {
  assert.equal((await fetch(`${base}/api/resumable-file-uploads`)).status, 401);
  const headers = await session(base);
  assert.equal((await createUpload(base, { Cookie: headers.Cookie, Origin: origin })).status, 403);
  const created = await createUpload(base, headers); assert.equal(created.status, 201); const upload = (await created.json()).upload;
  assert.equal(upload.status, "waiting"); assert.equal(upload.receivedBytes, 0); assert.equal(upload.owner, "Administrator");
  const duplicate = await createUpload(base, headers); assert.equal((await duplicate.json()).upload.id, upload.id);
  assert.equal((await createUpload(base, headers, { fileName: "different.txt" })).status, 409);

  const wrongOffset = await fetch(`${base}/api/resumable-file-uploads/${upload.id}/chunks`, { method: "POST", headers: { ...headers, "Content-Type": "application/octet-stream", "Upload-Offset": "1" }, body: Buffer.from("hello ") });
  assert.equal(wrongOffset.status, 409);
  const first = await fetch(`${base}/api/resumable-file-uploads/${upload.id}/chunks`, { method: "POST", headers: { ...headers, "Content-Type": "application/octet-stream", "Upload-Offset": "0" }, body: Buffer.from("hello ") });
  assert.equal(first.status, 200); assert.equal((await first.json()).nextOffset, 6);
  const second = await fetch(`${base}/api/resumable-file-uploads/${upload.id}/chunks`, { method: "POST", headers: { ...headers, "Content-Type": "application/octet-stream", "Upload-Offset": "6" }, body: Buffer.from("world") });
  assert.equal(second.status, 200); assert.equal((await second.json()).upload.receivedBytes, 11);
  assert.equal(database.prepare("SELECT received_bytes FROM file_uploads WHERE id=?").get(upload.id).received_bytes, 11);
  const completed = await fetch(`${base}/api/resumable-file-uploads/${upload.id}/complete`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "{}" });
  assert.equal(completed.status, 200); const result = (await completed.json()).upload; assert.equal(result.status, "completed"); assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.equal(await readFile(join(root, "uploads", "releases", "artifact.txt"), "utf8"), "hello world");
  assert.equal((await fetch(`${base}/api/resumable-file-uploads`, { headers })).status, 200);
}));

test("file uploads reject traversal, symlink directories, oversize chunks and target overwrite", async () => fixture(async (base, { root }) => {
  const headers = await session(base);
  for (const targetDirectory of ["../outside", "/absolute", "nested/../outside", "nested//outside"]) assert.equal((await createUpload(base, headers, { targetDirectory, idempotencyKey: `invalid-${crypto.randomUUID()}` })).status, 400);
  assert.equal((await createUpload(base, headers, { sizeBytes: 33, idempotencyKey: "oversized-file" })).status, 413);
  await mkdir(join(root, "uploads"), { recursive: true });
  await symlink(tmpdir(), join(root, "uploads", "linked"));
  assert.equal((await createUpload(base, headers, { targetDirectory: "linked", idempotencyKey: "symlink-target" })).status, 400);
  await writeFile(join(root, "uploads", "existing.txt"), "keep");
  assert.equal((await createUpload(base, headers, { fileName: "existing.txt", targetDirectory: "", idempotencyKey: "existing-target" })).status, 409);
  assert.equal(await readFile(join(root, "uploads", "existing.txt"), "utf8"), "keep");

  const upload = (await (await createUpload(base, headers, { fileName: "short.bin", targetDirectory: "", sizeBytes: 9, idempotencyKey: "short-chunk" })).json()).upload;
  const oversized = await fetch(`${base}/api/resumable-file-uploads/${upload.id}/chunks`, { method: "POST", headers: { ...headers, "Content-Type": "application/octet-stream", "Upload-Offset": "0" }, body: Buffer.alloc(9) });
  assert.equal(oversized.status, 413);
  assert.equal((await lstat(join(root, "uploads", `.short.bin.${upload.id}.upload`))).size, 0);
}));

test("file upload CORS preflight allows the offset header for browser chunks", async () => fixture(async (base) => {
  const response = await fetch(`${base}/api/resumable-file-uploads/11111111-1111-4111-8111-111111111111/chunks`, {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,upload-offset,x-csrf-token" },
  });
  assert.equal(response.status, 204);
  assert.match(response.headers.get("access-control-allow-headers"), /Upload-Offset/);
}));

test("file upload cancel removes partial data and clear-completed removes terminal records", async () => fixture(async (base, { root }) => {
  const headers = await session(base);
  const upload = (await (await createUpload(base, headers, { fileName: "cancel.txt", targetDirectory: "", sizeBytes: 3, idempotencyKey: "cancel-upload" })).json()).upload;
  const part = await fetch(`${base}/api/resumable-file-uploads/${upload.id}/chunks`, { method: "POST", headers: { ...headers, "Content-Type": "application/octet-stream", "Upload-Offset": "0" }, body: Buffer.from("ab") }); assert.equal(part.status, 200);
  const cancelled = await fetch(`${base}/api/resumable-file-uploads/${upload.id}`, { method: "DELETE", headers }); assert.equal((await cancelled.json()).upload.status, "cancelled");
  assert.equal((await fetch(`${base}/api/resumable-file-uploads/${upload.id}/complete`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "{}" })).status, 409);
  await assert.rejects(lstat(join(root, "uploads", `.cancel.txt.${upload.id}.upload`)), (error) => error.code === "ENOENT");
  const cleared = await fetch(`${base}/api/resumable-file-uploads/clear-completed`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "{}" }); assert.equal((await cleared.json()).removed, 0);
  const list = await (await fetch(`${base}/api/resumable-file-uploads`, { headers })).json(); assert.equal(list.uploads.some((row) => row.id === upload.id && row.status === "cancelled"), true);
}));

test("zero-byte uploads complete without chunks and read-only tokens cannot mutate", async () => fixture(async (base, { identity, root }) => {
  const admin = (await identity.login("admin", password, "token", "tests")).principal;
  const readToken = identity.createApiToken(admin, { name: "files-reader", permissions: ["files:read"], nodeScope: "all", expiresAt: null }).token;
  assert.equal((await fetch(`${base}/api/resumable-file-uploads`, { headers: { Authorization: `Bearer ${readToken}` } })).status, 200);
  assert.equal((await createUpload(base, { Authorization: `Bearer ${readToken}` }, { fileName: "blocked.txt", sizeBytes: 0, targetDirectory: "", idempotencyKey: "read-only-create" })).status, 403);
  const headers = await session(base);
  const upload = (await (await createUpload(base, headers, { fileName: "empty.txt", sizeBytes: 0, targetDirectory: "", idempotencyKey: "empty-upload" })).json()).upload;
  const completed = await fetch(`${base}/api/resumable-file-uploads/${upload.id}/complete`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "{}" });
  assert.equal((await completed.json()).upload.status, "completed");
  assert.equal((await lstat(join(root, "uploads", "empty.txt"))).size, 0);
}));
