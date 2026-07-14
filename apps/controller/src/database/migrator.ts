import type Database from "better-sqlite3";

export type Migration = { version: number; name: string; sql: string; replaces?: readonly string[] };

export function migrateDatabase(database: Database.Database, migrations: readonly Migration[]): void {
  database.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
  const appliedRows = database.prepare("SELECT version,name FROM schema_migrations").all() as Array<{ version: number; name: string }>;
  const appliedVersions = appliedRows.map((row) => row.version);
  const supportedVersion = Math.max(0, ...migrations.map((migration) => migration.version));
  const currentVersion = Math.max(0, ...appliedVersions);
  if (currentVersion > supportedVersion) throw new Error(`数据库 schema ${currentVersion} 高于当前支持版本 ${supportedVersion}，已拒绝启动`);
  const applied = new Map(appliedRows.map((row) => [row.version, row.name]));
  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    const appliedName = applied.get(migration.version);
    if (appliedName === migration.name) continue;
    if (appliedName && !migration.replaces?.includes(appliedName)) continue;
    database.transaction(() => {
      database.exec(migration.sql);
      const appliedAt = new Date().toISOString();
      if (appliedName) {
        database.prepare("UPDATE schema_migrations SET name=?,applied_at=? WHERE version=?").run(migration.name, appliedAt, migration.version);
      } else {
        database.prepare("INSERT INTO schema_migrations(version,name,applied_at) VALUES(?,?,?)").run(migration.version, migration.name, appliedAt);
      }
    })();
  }
}
