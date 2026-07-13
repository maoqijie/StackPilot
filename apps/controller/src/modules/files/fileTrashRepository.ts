import type Database from "better-sqlite3";
import type { RestoredTrashEntry, TrashEntry, TrashEntryKind } from "@stackpilot/contracts";

type TrashRow = {
  entry_id: string;
  name: string;
  kind: TrashEntryKind;
  original_path: string;
  size_bytes: number | null;
  deleted_at: string;
  expires_at: string;
  owner: string;
  reason: string;
  restored_at: string | null;
  restored_by: string | null;
};

export interface FileTrashRepository {
  listActive(): TrashEntry[];
  listRecentlyRestored(limit: number): RestoredTrashEntry[];
  restore(id: string, restoredAt: string, restoredBy: string): TrashEntry | null;
  purge(id: string, purgedAt: string): TrashEntry | null;
  purgeAll(purgedAt: string): number;
}

function activeEntry(row: TrashRow): TrashEntry {
  return { id: row.entry_id, name: row.name, kind: row.kind, originalPath: row.original_path, sizeBytes: row.size_bytes, deletedAt: row.deleted_at, expiresAt: row.expires_at, owner: row.owner, reason: row.reason };
}

export class MemoryFileTrashRepository implements FileTrashRepository {
  listActive() { return []; }
  listRecentlyRestored() { return []; }
  restore() { return null; }
  purge() { return null; }
  purgeAll() { return 0; }
}

export class SqliteFileTrashRepository implements FileTrashRepository {
  constructor(private readonly database: Database.Database) {}
  listActive() { return (this.database.prepare("SELECT * FROM file_trash_entries WHERE state='trashed' ORDER BY deleted_at DESC").all() as TrashRow[]).map(activeEntry); }
  listRecentlyRestored(limit: number) {
    return (this.database.prepare("SELECT * FROM file_trash_entries WHERE state='restored' ORDER BY restored_at DESC LIMIT ?").all(limit) as TrashRow[]).map((row) => ({ id: row.entry_id, name: row.name, originalPath: row.original_path, restoredAt: row.restored_at!, restoredBy: row.restored_by! }));
  }
  restore(id: string, restoredAt: string, restoredBy: string) { return this.transition(id, "restored", "restored_at=?, restored_by=?", [restoredAt, restoredBy]); }
  purge(id: string, purgedAt: string) { return this.transition(id, "purged", "purged_at=?", [purgedAt]); }
  purgeAll(purgedAt: string) { return this.database.prepare("UPDATE file_trash_entries SET state='purged', purged_at=?, version=version+1 WHERE state='trashed'").run(purgedAt).changes; }
  private transition(id: string, state: "restored" | "purged", columns: string, values: string[]) {
    return this.database.transaction(() => {
      const row = this.database.prepare("SELECT * FROM file_trash_entries WHERE entry_id=? AND state='trashed'").get(id) as TrashRow | undefined;
      if (!row) return null;
      this.database.prepare(`UPDATE file_trash_entries SET state=?, ${columns}, version=version+1 WHERE entry_id=? AND state='trashed'`).run(state, ...values, id);
      return activeEntry(row);
    })();
  }
}
