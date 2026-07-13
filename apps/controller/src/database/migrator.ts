import type Database from "better-sqlite3";

export type Migration = { version: number; name: string; sql: string };

export function migrateDatabase(database: Database.Database, migrations: readonly Migration[]): void {
  database.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
  const appliedVersions = (database.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: number }>).map((row) => row.version);
  const supportedVersion = Math.max(0, ...migrations.map((migration) => migration.version));
  const currentVersion = Math.max(0, ...appliedVersions);
  if (currentVersion > supportedVersion) throw new Error(`数据库 schema ${currentVersion} 高于当前支持版本 ${supportedVersion}，已拒绝启动`);
  const applied = new Set(appliedVersions);
  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    if (applied.has(migration.version)) continue;
    database.transaction(() => {
      database.exec(migration.sql);
      database.prepare("INSERT INTO schema_migrations(version,name,applied_at) VALUES(?,?,?)").run(migration.version, migration.name, new Date().toISOString());
    })();
  }
}
