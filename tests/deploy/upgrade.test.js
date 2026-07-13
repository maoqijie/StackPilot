import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { migrateDatabase } from "../../apps/controller/dist/database/migrator.js";
import { openDatabase } from "../../apps/controller/dist/database/database.js";

const migrations = new URL("../../apps/controller/src/database/migrations/", import.meta.url);
const readMigration = (name) => readFile(new URL(name, migrations), "utf8");
const identitySql = () => readMigration("001_identity.sql");
const releaseSql = () => readMigration("002_release_metadata.sql");
const uploadSql = () => readMigration("003_file_uploads.sql");
const terminalSql = () => readMigration("004_terminal_snippets.sql");

async function withDatabase(prefix, callback) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try { await callback(join(dir, "stackpilot.db")); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

async function migrateBase(database, fourthMigration) {
  migrateDatabase(database, [
    { version: 1, name: "identity", sql: await identitySql() },
    { version: 2, name: "release-metadata", sql: await releaseSql() },
    { version: 3, name: "file-uploads", sql: await uploadSql() },
    fourthMigration,
  ]);
}

const legacyTrashSql = `
CREATE TABLE file_trash_entries (
  entry_id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
  original_path TEXT NOT NULL, size_bytes INTEGER, deleted_at TEXT NOT NULL,
  expires_at TEXT NOT NULL, owner TEXT NOT NULL, reason TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'trashed', restored_at TEXT, restored_by TEXT,
  purged_at TEXT, version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX file_trash_state_time_idx ON file_trash_entries(state, deleted_at DESC);
UPDATE release_metadata SET schema_version = 4 WHERE singleton = 1;
`;

test("schema 1 upgrades to schema 6 without losing identity data", async () => withDatabase("stackpilot-upgrade-", async (path) => {
  const database = new Database(path);
  migrateDatabase(database, [{ version: 1, name: "identity", sql: await identitySql() }]);
  const now = new Date().toISOString();
  database.prepare("INSERT INTO users(id,username,password_hash,display_name,password_changed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
    .run("11111111-1111-4111-8111-111111111111", "upgrade-user", "hash", "Upgrade User", now, now, now);
  database.close();
  const upgraded = openDatabase(path);
  assert.equal(upgraded.prepare("SELECT username FROM users").get().username, "upgrade-user");
  assert.equal(upgraded.prepare("SELECT max(version) AS version FROM schema_migrations").get().version, 6);
  assert.equal(upgraded.prepare("SELECT schema_version FROM release_metadata").get().schema_version, 6);
  for (const name of ["file_uploads", "terminal_snippet_preferences", "file_trash_entries"]) {
    assert.ok(upgraded.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name));
  }
  assert.ok(upgraded.prepare("SELECT name FROM pragma_table_info('file_trash_entries') WHERE name='trash_path'").get());
  upgraded.close();
}));

test("main schema 4 preserves terminal preferences and gains trash storage", async () => withDatabase("stackpilot-main-v4-", async (path) => {
  const database = new Database(path);
  await migrateBase(database, { version: 4, name: "terminal-snippets", sql: await terminalSql() });
  const now = new Date().toISOString();
  database.prepare("INSERT INTO users(id,username,password_hash,display_name,password_changed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
    .run("11111111-1111-4111-8111-111111111111", "terminal-user", "hash", "Terminal User", now, now, now);
  database.prepare("INSERT INTO terminal_snippet_preferences(user_id,snippet_id,favorite,updated_at) VALUES(?,?,1,?)")
    .run("11111111-1111-4111-8111-111111111111", "system-status", now);
  database.close();
  const upgraded = openDatabase(path);
  assert.equal(upgraded.prepare("SELECT favorite FROM terminal_snippet_preferences").get().favorite, 1);
  assert.ok(upgraded.prepare("SELECT name FROM pragma_table_info('file_trash_entries') WHERE name='trash_path'").get());
  assert.equal(upgraded.prepare("SELECT max(version) AS version FROM schema_migrations").get().version, 6);
  upgraded.close();
}));

test("legacy trash schema 4 preserves entries and gains terminal preferences", async () => withDatabase("stackpilot-trash-v4-", async (path) => {
  const database = new Database(path);
  await migrateBase(database, { version: 4, name: "file-trash", sql: legacyTrashSql });
  const now = new Date().toISOString();
  database.prepare("INSERT INTO file_trash_entries(entry_id,name,kind,original_path,deleted_at,expires_at,owner,reason) VALUES(?,?,?,?,?,?,?,?)")
    .run("trash-entry", "legacy.txt", "file", "/tmp/legacy.txt", now, now, "admin", "legacy");
  database.close();
  const upgraded = openDatabase(path);
  const row = upgraded.prepare("SELECT name, trash_path FROM file_trash_entries WHERE entry_id='trash-entry'").get();
  assert.deepEqual(row, { name: "legacy.txt", trash_path: null });
  assert.ok(upgraded.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='terminal_snippet_preferences'").get());
  assert.equal(upgraded.prepare("SELECT max(version) AS version FROM schema_migrations").get().version, 6);
  upgraded.close();
}));

test("legacy branch schema 5 gains terminal preferences at schema 6", async () => withDatabase("stackpilot-trash-v5-", async (path) => {
  const database = new Database(path);
  await migrateBase(database, { version: 4, name: "file-trash", sql: legacyTrashSql });
  migrateDatabase(database, [{ version: 5, name: "file-trash-storage", sql: "ALTER TABLE file_trash_entries ADD COLUMN trash_path TEXT; UPDATE release_metadata SET schema_version=5 WHERE singleton=1;" }]);
  database.close();
  const upgraded = openDatabase(path);
  assert.ok(upgraded.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='terminal_snippet_preferences'").get());
  assert.ok(upgraded.prepare("SELECT name FROM pragma_table_info('file_trash_entries') WHERE name='trash_path'").get());
  assert.equal(upgraded.prepare("SELECT max(version) AS version FROM schema_migrations").get().version, 6);
  upgraded.close();
}));

test("controller refuses to open a database from a future schema", async () => withDatabase("stackpilot-future-schema-", async (path) => {
  const database = new Database(path);
  database.exec("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
  database.prepare("INSERT INTO schema_migrations(version,name,applied_at) VALUES(7,'future',?)").run(new Date().toISOString());
  database.close();
  assert.throws(() => openDatabase(path), /高于当前支持版本 6/);
}));

test("failed migration rolls back schema and preserves data", () => {
  const database = new Database(":memory:");
  migrateDatabase(database, [{ version: 1, name: "base", sql: "CREATE TABLE preserved(value TEXT); INSERT INTO preserved VALUES('before');" }]);
  assert.throws(() => migrateDatabase(database, [{ version: 2, name: "broken", sql: "ALTER TABLE preserved ADD COLUMN next TEXT; INSERT INTO missing_table VALUES(1);" }]));
  assert.equal(database.prepare("SELECT value FROM preserved").get().value, "before");
  assert.equal(database.prepare("SELECT max(version) AS version FROM schema_migrations").get().version, 1);
  assert.deepEqual(database.prepare("PRAGMA table_info(preserved)").all().map((row) => row.name), ["value"]);
  database.close();
});
