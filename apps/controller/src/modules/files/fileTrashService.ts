import type Database from "better-sqlite3";
import type { RestoredTrashEntry, TrashEntry, TrashPayload } from "@stackpilot/contracts";
import { randomUUID } from "node:crypto";
import type { FileService, QuarantinedFile } from "./fileService.js";
import { ServiceError } from "../serviceError.js";

type TrashRow = {
  entry_id: string; name: string; kind: "file" | "directory"; root_path: string; original_path: string;
  quarantine_path: string; size_bytes: number | null; deleted_at: string; expires_at: string; owner: string;
  reason: string; state: "moving" | "trashed" | "restoring" | "restored" | "purging" | "purged"; restored_at: string | null; restored_by: string | null;
};

const RETENTION_DAYS = 7;
const activeEntry = (row: TrashRow): TrashEntry => ({ id: row.entry_id, name: row.name, kind: row.kind, originalPath: row.original_path, sizeBytes: row.size_bytes, deletedAt: row.deleted_at, expiresAt: row.expires_at, owner: row.owner, reason: row.reason });
const restoredEntry = (row: TrashRow): RestoredTrashEntry => ({ id: row.entry_id, name: row.name, originalPath: row.original_path, restoredAt: row.restored_at!, restoredBy: row.restored_by! });
const quarantinedFile = (row: TrashRow): QuarantinedFile => ({ id: row.entry_id, name: row.name, kind: row.kind, rootPath: row.root_path, originalPath: row.original_path, quarantinePath: row.quarantine_path, sizeBytes: row.size_bytes });

export class FileTrashService {
  private mutation = Promise.resolve();
  constructor(private readonly database: Database.Database, private readonly files: FileService) {}

  async startup(): Promise<void> { await this.mutate(() => this.reconcilePending()); }

  async list(): Promise<TrashPayload> {
    return this.mutate(() => this.listUnlocked());
  }

  private async listUnlocked(): Promise<TrashPayload> {
    await this.reconcilePending();
    const entries = (this.database.prepare("SELECT * FROM file_trash_entries WHERE state='trashed' ORDER BY deleted_at DESC LIMIT 5000").all() as TrashRow[]).map(activeEntry);
    const recentlyRestored = (this.database.prepare("SELECT * FROM file_trash_entries WHERE state='restored' ORDER BY restored_at DESC LIMIT 20").all() as TrashRow[]).map(restoredEntry);
    return { entries, recentlyRestored, retentionDays: RETENTION_DAYS, collectedAt: new Date().toISOString() };
  }

  async move(path: string, owner: string): Promise<TrashEntry> {
    return this.mutate(async () => {
      await this.reconcilePending();
      const id = randomUUID();
      let quarantined = false;
      const now = new Date(), deletedAt = now.toISOString(), expiresAt = new Date(now.getTime() + RETENTION_DAYS * 86_400_000).toISOString();
      try {
        await this.files.quarantine(path, id, (file) => {
          this.database.prepare("INSERT INTO file_trash_entries(entry_id,name,kind,root_path,original_path,quarantine_path,size_bytes,deleted_at,expires_at,owner,reason,state) VALUES(?,?,?,?,?,?,?,?,?,?,?,'moving')").run(
            id, file.name, file.kind, file.rootPath, file.originalPath, file.quarantinePath, file.sizeBytes,
            deletedAt, expiresAt, owner, "从文件管理删除",
          );
        });
        quarantined = true;
        const updated = this.database.prepare("UPDATE file_trash_entries SET state='trashed',version=version+1 WHERE entry_id=? AND state='moving'").run(id);
        if (updated.changes !== 1) throw new ServiceError(409, "BAD_REQUEST", "回收站项目状态已变化");
      } catch (error) {
        if (quarantined) await this.reconcileRow(this.required(id)).catch(() => undefined);
        else this.database.prepare("DELETE FROM file_trash_entries WHERE entry_id=? AND state='moving'").run(id);
        const row = this.database.prepare("SELECT state FROM file_trash_entries WHERE entry_id=?").get(id) as { state: TrashRow["state"] } | undefined;
        if (row?.state !== "trashed") throw error;
      }
      return activeEntry(this.required(id));
    });
  }

  async restore(id: string, actor: string) {
    return this.mutate(async () => {
      await this.reconcilePending();
      const row = this.active(id), file = quarantinedFile(row);
      const restoredAt = new Date().toISOString();
      const started = this.database.prepare("UPDATE file_trash_entries SET state='restoring',restored_at=?,restored_by=?,version=version+1 WHERE entry_id=? AND state='trashed'").run(restoredAt, actor, id);
      if (started.changes !== 1) throw new ServiceError(409, "BAD_REQUEST", "回收站项目状态已变化");
      try {
        await this.files.restoreQuarantined(file);
        const updated = this.database.prepare("UPDATE file_trash_entries SET state='restored',version=version+1 WHERE entry_id=? AND state='restoring'").run(id);
        if (updated.changes !== 1) throw new ServiceError(409, "BAD_REQUEST", "回收站项目状态已变化");
      } catch (error) {
        await this.reconcileRow(this.required(id));
        if (this.required(id).state !== "restored") throw error;
      }
      return { message: `${row.name} 已恢复`, trash: await this.listUnlocked() };
    });
  }

  async purge(id: string) { return this.mutate(async () => { await this.reconcilePending(); return this.purgeUnlocked(id); }); }

  async purgeAll() {
    return this.mutate(async () => {
      await this.reconcilePending();
      const ids = (this.database.prepare("SELECT entry_id AS id FROM file_trash_entries WHERE state='trashed' ORDER BY deleted_at").all() as Array<{ id: string }>).map((row) => row.id);
      for (const id of ids) await this.purgeUnlocked(id, false);
      return { message: `已永久删除回收站中的 ${ids.length} 个项目`, trash: await this.listUnlocked() };
    });
  }

  private async purgeUnlocked(id: string, response = true) {
    const row = this.active(id);
    const started = this.database.prepare("UPDATE file_trash_entries SET state='purging',version=version+1 WHERE entry_id=? AND state='trashed'").run(id);
    if (started.changes !== 1) throw new ServiceError(409, "BAD_REQUEST", "回收站项目状态已变化");
    try {
      await this.files.purgeQuarantined(quarantinedFile(row));
      const updated = this.database.prepare("UPDATE file_trash_entries SET state='purged',purged_at=?,version=version+1 WHERE entry_id=? AND state='purging'").run(new Date().toISOString(), id);
      if (updated.changes !== 1) throw new ServiceError(409, "BAD_REQUEST", "回收站项目状态已变化");
    } catch (error) {
      await this.reconcileRow(this.required(id));
      if (this.required(id).state !== "purged") throw error;
    }
    return response ? { message: `${row.name} 已永久删除`, trash: await this.listUnlocked() } : undefined;
  }

  private async reconcilePending() {
    const rows = this.database.prepare("SELECT * FROM file_trash_entries WHERE state IN ('moving','restoring','purging') ORDER BY deleted_at").all() as TrashRow[];
    for (const row of rows) await this.reconcileRow(row);
  }

  private async reconcileRow(row: TrashRow) {
    const file = quarantinedFile(row);
    if (row.state === "moving") {
      const state = await this.files.reconcileMoving(file);
      if (state === "aborted") this.database.prepare("DELETE FROM file_trash_entries WHERE entry_id=? AND state='moving'").run(row.entry_id);
      else this.database.prepare("UPDATE file_trash_entries SET state=?,purged_at=CASE WHEN ?='purged' THEN ? ELSE purged_at END,version=version+1 WHERE entry_id=? AND state='moving'").run(state, state, new Date().toISOString(), row.entry_id);
      return;
    }
    if (row.state === "restoring") {
      const state = await this.files.reconcileRestoring(file);
      this.database.prepare("UPDATE file_trash_entries SET state=?,restored_at=CASE WHEN ?='restored' THEN restored_at ELSE NULL END,restored_by=CASE WHEN ?='restored' THEN restored_by ELSE NULL END,purged_at=CASE WHEN ?='purged' THEN ? ELSE purged_at END,version=version+1 WHERE entry_id=? AND state='restoring'").run(state, state, state, state, new Date().toISOString(), row.entry_id);
      return;
    }
    if (row.state === "purging") {
      const state = await this.files.reconcilePurging(file);
      this.database.prepare("UPDATE file_trash_entries SET state=?,purged_at=CASE WHEN ?='purged' THEN ? ELSE purged_at END,version=version+1 WHERE entry_id=? AND state='purging'").run(state, state, new Date().toISOString(), row.entry_id);
    }
  }

  private active(id: string) {
    const row = this.required(id);
    if (row.state !== "trashed") throw new ServiceError(404, "NOT_FOUND", "回收站项目不存在");
    return row;
  }

  private required(id: string): TrashRow {
    const row = this.database.prepare("SELECT * FROM file_trash_entries WHERE entry_id=?").get(id) as TrashRow | undefined;
    if (!row) throw new ServiceError(404, "NOT_FOUND", "回收站项目不存在");
    return row;
  }

  private async mutate<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutation; let release!: () => void;
    this.mutation = new Promise<void>((resolve) => { release = resolve; });
    await previous; try { return await operation(); } finally { release(); }
  }
}
