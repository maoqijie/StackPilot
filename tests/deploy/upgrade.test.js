import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { migrateDatabase } from "../../apps/controller/dist/database/migrator.js";
import { openDatabase } from "../../apps/controller/dist/database/database.js";

const migrations = new URL("../../apps/controller/src/database/migrations/", import.meta.url);

test("schema 1 upgrades to schema 5 without losing identity data", async () => {
  const dir = await mkdtemp(join(tmpdir(), "stackpilot-upgrade-"));
  const path = join(dir, "stackpilot.db");
  try {
    const db = new Database(path);
    migrateDatabase(db, [{ version: 1, name: "identity", sql: await readFile(new URL("001_identity.sql", migrations), "utf8") }]);
    const now = new Date().toISOString();
    db.prepare("INSERT INTO users(id,username,password_hash,display_name,password_changed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
      .run("11111111-1111-4111-8111-111111111111", "upgrade-user", "hash", "Upgrade User", now, now, now);
    db.close();

    const upgraded = openDatabase(path);
    assert.equal(upgraded.prepare("SELECT username FROM users").get().username, "upgrade-user");
    assert.equal(upgraded.prepare("SELECT max(version) AS version FROM schema_migrations").get().version, 5);
    const release = upgraded.prepare("SELECT application_version, schema_version FROM release_metadata").get();
    assert.equal(release.application_version, "0.2.0-preview.1");
    assert.equal(release.schema_version, 5);
    assert.ok(upgraded.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='file_uploads'").get());
    assert.ok(upgraded.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='file_trash_entries'").get());
    assert.ok(upgraded.prepare("SELECT name FROM pragma_table_info('file_trash_entries') WHERE name='trash_path'").get());
    upgraded.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("legacy file-trash schema 3 upgrades without skipping file uploads", async () => {
  const dir = await mkdtemp(join(tmpdir(), "stackpilot-trash-upgrade-"));
  const path = join(dir, "stackpilot.db");
  try {
    const db = new Database(path);
    migrateDatabase(db, [
      { version: 1, name: "identity", sql: await readFile(new URL("001_identity.sql", migrations), "utf8") },
      { version: 2, name: "release-metadata", sql: await readFile(new URL("002_release_metadata.sql", migrations), "utf8") },
      { version: 3, name: "file-trash", sql: await readFile(new URL("004_file_trash.sql", migrations), "utf8").then((sql) => sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS file_trash_entries")).replace("schema_version = 4", "schema_version = 3")) },
    ]);
    db.close();

    const upgraded = openDatabase(path);
    assert.equal(upgraded.prepare("SELECT max(version) AS version FROM schema_migrations").get().version, 5);
    assert.ok(upgraded.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='file_uploads'").get());
    assert.ok(upgraded.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='file_trash_entries'").get());
    assert.ok(upgraded.prepare("SELECT name FROM pragma_table_info('file_trash_entries') WHERE name='trash_path'").get());
    upgraded.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("controller refuses to open a database from a future schema", async () => {
  const dir = await mkdtemp(join(tmpdir(), "stackpilot-future-schema-"));
  const path = join(dir, "stackpilot.db");
  try {
    const db = new Database(path);
    db.exec("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
    db.prepare("INSERT INTO schema_migrations(version,name,applied_at) VALUES(6,'future',?)").run(new Date().toISOString());
    db.close();
    assert.throws(() => openDatabase(path), /高于当前支持版本 5/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("failed migration rolls back schema and preserves data", () => {
  const db = new Database(":memory:");
  migrateDatabase(db, [{ version: 1, name: "base", sql: "CREATE TABLE preserved(value TEXT); INSERT INTO preserved VALUES('before');" }]);
  assert.throws(() => migrateDatabase(db, [{ version: 2, name: "broken", sql: "ALTER TABLE preserved ADD COLUMN next TEXT; INSERT INTO missing_table VALUES(1);" }]));
  assert.equal(db.prepare("SELECT value FROM preserved").get().value, "before");
  assert.equal(db.prepare("SELECT max(version) AS version FROM schema_migrations").get().version, 1);
  assert.deepEqual(db.prepare("PRAGMA table_info(preserved)").all().map((row) => row.name), ["value"]);
  db.close();
});
