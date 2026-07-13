import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { FileTrashService } from "../../apps/controller/dist/modules/files/fileTrashService.js";
import { FileService } from "../../apps/controller/dist/modules/files/fileService.js";

async function fixture(callback) {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-trash-"));
  const database = openDatabase(":memory:");
  try { await callback({ root, database, trash: new FileTrashService(database, new FileService([root])) }); }
  finally { database.close(); await rm(root, { recursive: true, force: true }); }
}
async function missing(path) { return access(path).then(() => false, () => true); }

test("file trash moves real bytes into quarantine and restores them", async () => fixture(async ({ root, database, trash }) => {
  const source = join(root, "release.txt");
  await writeFile(source, "release-content");
  const entry = await trash.move(source, "Administrator");
  const stored = database.prepare("SELECT * FROM file_trash_entries WHERE entry_id=?").get(entry.id);
  assert.equal(await missing(source), true);
  assert.equal(await readFile(stored.quarantine_path, "utf8"), "release-content");
  assert.deepEqual((await trash.list()).entries.map((row) => row.id), [entry.id]);

  const restored = await trash.restore(entry.id, "Administrator");
  assert.equal(await readFile(source, "utf8"), "release-content");
  assert.equal(await missing(stored.quarantine_path), true);
  assert.equal(restored.trash.entries.length, 0);
  assert.equal(restored.trash.recentlyRestored[0].restoredBy, "Administrator");
}));

test("file trash permanently deletes real files and directories", async () => fixture(async ({ root, database, trash }) => {
  const first = join(root, "old.log"), directory = join(root, "cache"), nested = join(directory, "data.bin");
  await writeFile(first, "old"); await mkdir(directory); await writeFile(nested, "cache");
  const fileEntry = await trash.move(first, "Administrator"), directoryEntry = await trash.move(directory, "Administrator");
  const filePath = database.prepare("SELECT quarantine_path AS path FROM file_trash_entries WHERE entry_id=?").get(fileEntry.id).path;
  const directoryPath = database.prepare("SELECT quarantine_path AS path FROM file_trash_entries WHERE entry_id=?").get(directoryEntry.id).path;
  await trash.purge(fileEntry.id);
  assert.equal(await missing(filePath), true);
  const result = await trash.purgeAll();
  assert.match(result.message, /1 个项目/);
  assert.equal(await missing(directoryPath), true);
  assert.deepEqual(database.prepare("SELECT state FROM file_trash_entries ORDER BY name").all().map((row) => row.state), ["purged", "purged"]);
}));

test("file trash restore never overwrites a replacement at the original path", async () => fixture(async ({ root, database, trash }) => {
  const source = join(root, "config.json");
  await writeFile(source, "old");
  const entry = await trash.move(source, "Administrator");
  const quarantine = database.prepare("SELECT quarantine_path AS path FROM file_trash_entries WHERE entry_id=?").get(entry.id).path;
  await writeFile(source, "replacement");
  await assert.rejects(trash.restore(entry.id, "Administrator"), (error) => error.status === 409);
  assert.equal(await readFile(source, "utf8"), "replacement");
  assert.equal(await readFile(quarantine, "utf8"), "old");
  assert.equal(database.prepare("SELECT state FROM file_trash_entries WHERE entry_id=?").get(entry.id).state, "trashed");
}));

test("file trash rejects tampered quarantine paths without touching external files", async () => fixture(async ({ root, database, trash }) => {
  const source = join(root, "site.txt"), outside = await mkdtemp(join(tmpdir(), "stackpilot-trash-outside-")), sentinel = join(outside, "sentinel");
  try {
    await writeFile(source, "site"); await writeFile(sentinel, "keep");
    const entry = await trash.move(source, "Administrator");
    database.prepare("UPDATE file_trash_entries SET quarantine_path=? WHERE entry_id=?").run(sentinel, entry.id);
    await assert.rejects(trash.purge(entry.id), (error) => error.status === 403);
    assert.equal(await readFile(sentinel, "utf8"), "keep");
  } finally { await rm(outside, { recursive: true, force: true }); }
}));

test("file trash reconciles a move interrupted after the filesystem rename", async () => fixture(async ({ root, database, trash }) => {
  const source = join(root, "interrupted-move.txt"), id = randomUUID(), deletedAt = new Date().toISOString();
  await writeFile(source, "move-content");
  const files = new FileService([root]);
  const file = await files.quarantine(source, id, (prepared) => {
    database.prepare("INSERT INTO file_trash_entries(entry_id,name,kind,root_path,original_path,quarantine_path,size_bytes,deleted_at,expires_at,owner,reason,state) VALUES(?,?,?,?,?,?,?,?,?,?,?,'moving')").run(
      id, prepared.name, prepared.kind, prepared.rootPath, prepared.originalPath, prepared.quarantinePath, prepared.sizeBytes,
      deletedAt, new Date(Date.now() + 86_400_000).toISOString(), "Administrator", "test",
    );
  });

  const payload = await trash.list();
  assert.equal(payload.entries[0].id, id);
  assert.equal(database.prepare("SELECT state FROM file_trash_entries WHERE entry_id=?").get(id).state, "trashed");
  assert.equal(await readFile(file.quarantinePath, "utf8"), "move-content");
}));

test("file trash keeps the source in place when the intent insert fails", async () => fixture(async ({ root, database, trash }) => {
  const source = join(root, "insert-failure.txt");
  await writeFile(source, "keep-source");
  database.exec("CREATE TRIGGER reject_trash_insert BEFORE INSERT ON file_trash_entries BEGIN SELECT RAISE(ABORT, 'intent rejected'); END");

  await assert.rejects(trash.move(source, "Administrator"), /intent rejected/);
  assert.equal(await readFile(source, "utf8"), "keep-source");
  assert.equal(database.prepare("SELECT count(*) AS count FROM file_trash_entries").get().count, 0);
}));

test("file trash reconciles a restore interrupted after the filesystem rename", async () => fixture(async ({ root, database, trash }) => {
  const source = join(root, "interrupted-restore.txt");
  await writeFile(source, "restore-content");
  const entry = await trash.move(source, "Administrator");
  const row = database.prepare("SELECT * FROM file_trash_entries WHERE entry_id=?").get(entry.id);
  database.prepare("UPDATE file_trash_entries SET state='restoring',restored_at=?,restored_by=? WHERE entry_id=?").run(new Date().toISOString(), "Administrator", entry.id);
  await new FileService([root]).restoreQuarantined({ id: row.entry_id, name: row.name, kind: row.kind, rootPath: row.root_path, originalPath: row.original_path, quarantinePath: row.quarantine_path, sizeBytes: row.size_bytes });

  const payload = await trash.list();
  assert.equal(payload.entries.length, 0);
  assert.equal(payload.recentlyRestored[0].id, entry.id);
  assert.equal(database.prepare("SELECT state FROM file_trash_entries WHERE entry_id=?").get(entry.id).state, "restored");
  assert.equal(await readFile(source, "utf8"), "restore-content");
}));

test("file trash reconciles a purge interrupted after the filesystem deletion", async () => fixture(async ({ root, database, trash }) => {
  const source = join(root, "interrupted-purge.txt");
  await writeFile(source, "purge-content");
  const entry = await trash.move(source, "Administrator");
  const row = database.prepare("SELECT * FROM file_trash_entries WHERE entry_id=?").get(entry.id);
  database.prepare("UPDATE file_trash_entries SET state='purging' WHERE entry_id=?").run(entry.id);
  await new FileService([root]).purgeQuarantined({ id: row.entry_id, name: row.name, kind: row.kind, rootPath: row.root_path, originalPath: row.original_path, quarantinePath: row.quarantine_path, sizeBytes: row.size_bytes });

  const payload = await trash.list();
  assert.equal(payload.entries.length, 0);
  assert.equal(database.prepare("SELECT state FROM file_trash_entries WHERE entry_id=?").get(entry.id).state, "purged");
  assert.equal(await missing(row.quarantine_path), true);
}));
