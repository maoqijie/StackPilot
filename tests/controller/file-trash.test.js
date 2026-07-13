import assert from "node:assert/strict";
import test from "node:test";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { SqliteFileTrashRepository } from "../../apps/controller/dist/modules/files/fileTrashRepository.js";
import { FileTrashService } from "../../apps/controller/dist/modules/files/fileTrashService.js";

const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];

function seed(database) {
  const insert = database.prepare("INSERT INTO file_trash_entries(entry_id,name,kind,original_path,size_bytes,deleted_at,expires_at,owner,reason) VALUES(?,?,?,?,?,?,?,?,?)");
  insert.run(ids[0], "old.log", "file", "/tmp/old.log", 1024, "2026-07-14T00:00:00.000Z", "2026-07-21T00:00:00.000Z", "root", "日志轮转");
  insert.run(ids[1], "cache", "directory", "/tmp/cache", null, "2026-07-13T00:00:00.000Z", "2026-07-20T00:00:00.000Z", "www-data", "缓存过期");
}

test("file trash persists list, restore history and permanent deletion", async () => {
  const database = openDatabase(":memory:");
  try {
    seed(database);
    const service = new FileTrashService(new SqliteFileTrashRepository(database));
    assert.deepEqual(service.list().entries.map((entry) => entry.name), ["old.log", "cache"]);
    const restored = await service.restore(ids[0], "admin");
    assert.deepEqual(restored.trash.entries.map((entry) => entry.name), ["cache"]);
    assert.deepEqual(restored.trash.recentlyRestored.map((entry) => [entry.name, entry.restoredBy]), [["old.log", "admin"]]);
    assert.equal(database.prepare("SELECT state FROM file_trash_entries WHERE entry_id=?").get(ids[0]).state, "restored");
    await assert.rejects(service.restore(ids[0], "admin"), /不存在/);
    const purged = await service.purge(ids[1]);
    assert.equal(purged.trash.entries.length, 0);
    assert.equal(database.prepare("SELECT state FROM file_trash_entries WHERE entry_id=?").get(ids[1]).state, "purged");
  } finally { database.close(); }
});

test("file trash purge all only transitions active entries", async () => {
  const database = openDatabase(":memory:");
  try {
    seed(database);
    const service = new FileTrashService(new SqliteFileTrashRepository(database));
    await service.restore(ids[0], "admin");
    const result = await service.purgeAll();
    assert.match(result.message, /1 个项目/);
    assert.equal(result.trash.entries.length, 0);
    assert.equal(result.trash.recentlyRestored.length, 1);
  } finally { database.close(); }
});
