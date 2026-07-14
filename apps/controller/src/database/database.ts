import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrateDatabase } from "./migrator.js";

const migrationDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "migrations");

export function openDatabase(path: string): Database.Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const database = new Database(path);
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  if (path !== ":memory:") database.pragma("journal_mode = WAL");
  try {
    migrateDatabase(database, [
      { version: 1, name: "identity-rbac-agent-audit", sql: readFileSync(resolve(migrationDirectory,"001_identity.sql"), "utf8") },
      { version: 2, name: "release-metadata", sql: readFileSync(resolve(migrationDirectory,"002_release_metadata.sql"), "utf8") },
      { version: 3, name: "file-uploads", sql: readFileSync(resolve(migrationDirectory,"003_file_uploads.sql"), "utf8") },
      { version: 4, name: "terminal-snippets", sql: readFileSync(resolve(migrationDirectory,"004_terminal_snippets.sql"), "utf8") },
      { version: 5, name: "file-trash", sql: readFileSync(resolve(migrationDirectory,"005_file_trash.sql"), "utf8") },
      { version: 6, name: "site-management", sql: readFileSync(resolve(migrationDirectory,"006_site_management.sql"), "utf8") },
    ]);
  } catch (error) {
    database.close();
    throw error;
  }
  return database;
}
