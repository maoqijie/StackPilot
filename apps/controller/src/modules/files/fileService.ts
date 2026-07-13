import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, link, lstat, mkdir, open, readdir, readFile, realpath, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, normalize, resolve } from "node:path";
import {
  FileUploadRecordSchema, TrashFileEntrySchema,
  type FileEntry, type FileUploadRecord,
} from "@stackpilot/contracts";
import { z } from "zod";
import { ServiceError } from "../serviceError.js";
import { FileStorageSafety, isWithin, type StableDirectory } from "./fileStorageSafety.js";
import { isCleanRestoreConflict, restoreMarker, restoreWithoutOverwrite } from "./fileRestore.js";

const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const TRASH_MAINTENANCE_MS = 60 * 60 * 1000;
const MAX_TRASH_ENTRIES = 10_000;
const META_FILE = ".stackpilot-trash.json";
const HISTORY_FILE = ".stackpilot-uploads.json";
const TRANSACTION_FILE = ".stackpilot-file-transaction.json";
const TrashMetaSchema = TrashFileEntrySchema.extend({ storedName: z.string() }).strict().superRefine((row, context) => {
  if (row.storedName !== `${row.id}.data`) context.addIssue({ code: "custom", message: "回收站存储名称无效" });
});
const TrashMetadataSchema = z.array(TrashMetaSchema).max(MAX_TRASH_ENTRIES);
const UploadHistorySchema = z.array(FileUploadRecordSchema).max(500);
type TrashMeta = z.infer<typeof TrashMetaSchema>;
const FileTransactionSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("trash"), row: TrashMetaSchema }).strict(),
  z.object({ operation: z.literal("restore"), row: TrashMetaSchema }).strict(),
  z.object({ operation: z.literal("purge"), rows: z.array(TrashMetaSchema).max(MAX_TRASH_ENTRIES) }).strict(),
  z.object({ operation: z.literal("upload"), targetPath: z.string().min(1).max(4096), temporaryName: z.string().regex(/^\.upload-[0-9a-f-]+\.tmp$/i), upload: FileUploadRecordSchema }).strict(),
]);
type FileTransaction = z.infer<typeof FileTransactionSchema>;

function ownerLabel(uid: number) { return `uid:${uid}`; }
function entryId(path: string, info: { dev: number | bigint; ino: number | bigint }) {
  return createHash("sha256").update(`${info.dev}:${info.ino}:${path}`).digest("hex");
}
function cleanName(name: string) {
  if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\") || name.includes("\0")) throw new ServiceError(400, "BAD_REQUEST", "文件名无效");
  return name;
}
function metadataError(label: string) { return new ServiceError(500, "INTERNAL_ERROR", `${label}元数据损坏`); }

export class FileService {
  private readonly root: string;
  private readonly trashRoot: string;
  private readonly safety: FileStorageSafety;
  private storageReady: Promise<void> | null = null;
  private mutationQueue = Promise.resolve();
  private readonly maintenanceTimer: NodeJS.Timeout;

  constructor(root: string, trashRoot: string, readonly maxUploadBytes: number, repoRoot: string) {
    this.safety = new FileStorageSafety(root, repoRoot);
    this.root = this.safety.root;
    this.trashRoot = isAbsolute(trashRoot) ? normalize(trashRoot) : resolve(repoRoot, trashRoot);
    if (isWithin(this.root, this.trashRoot) || isWithin(this.trashRoot, this.root)) throw new Error("文件根目录与回收站目录必须彼此隔离");
    this.maintenanceTimer = setInterval(() => { void this.exclusive(async () => { await this.ensureStorage(); await this.cleanupExpired(); }).catch(() => undefined); }, TRASH_MAINTENANCE_MS);
    this.maintenanceTimer.unref();
    const initialMaintenance = setTimeout(() => { void this.exclusive(async () => { await this.ensureStorage(); await this.cleanupExpired(); }).catch(() => undefined); }, 1_000);
    initialMaintenance.unref();
  }

  private ensureStorage() {
    this.storageReady ??= this.initializeStorage();
    return this.storageReady;
  }

  private async initializeStorage() {
    await mkdir(this.root, { recursive: true, mode: 0o750 });
    await mkdir(this.trashRoot, { recursive: true, mode: 0o700 });
    await chmod(this.trashRoot, 0o700);
    const [canonicalRoot, canonicalTrash, rootInfo, trashInfo] = await Promise.all([
      realpath(this.root), realpath(this.trashRoot), stat(this.root), stat(this.trashRoot),
    ]);
    if (isWithin(canonicalRoot, canonicalTrash) || isWithin(canonicalTrash, canonicalRoot)) throw new Error("文件根目录与回收站目录必须彼此隔离");
    if (rootInfo.dev !== trashInfo.dev) throw new Error("文件根目录与回收站目录必须位于同一文件系统");
    await this.recoverTransaction();
    await this.reconcileTrashStorage();
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation);
    this.mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private withStableDirectory<T>(path: string, operation: (directory: StableDirectory) => Promise<T>) {
    return this.safety.withStableDirectory(path, operation);
  }

  private async toEntry(operationPath: string, absolutePath = operationPath): Promise<FileEntry> {
    const info = await stat(operationPath);
    return { id: entryId(absolutePath, info), name: basename(absolutePath), path: this.safety.virtualPath(absolutePath), kind: info.isDirectory() ? "directory" : "file", sizeBytes: info.isDirectory() ? null : info.size, modifiedAt: info.mtime.toISOString(), owner: ownerLabel(info.uid) };
  }

  async list(path: string) {
    await this.ensureStorage();
    return this.withStableDirectory(path, async (directory) => {
      const rows = await readdir(directory.operationPath, { withFileTypes: true });
      if (rows.length > 10_000) throw new ServiceError(409, "BAD_REQUEST", "目录项目超过 10000 个，拒绝展示");
      const entries: FileEntry[] = [];
      for (const row of rows) {
        if (row.name.startsWith(".stackpilot-upload-") || row.isSymbolicLink() || (!row.isDirectory() && !row.isFile())) continue;
        entries.push(await this.toEntry(join(directory.operationPath, row.name), join(directory.absolutePath, row.name)));
      }
      await this.safety.assertStableDirectory(directory);
      entries.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name, "zh-Hans-CN") : a.kind === "directory" ? -1 : 1);
      return { root: "/", path: this.safety.virtualPath(directory.absolutePath), entries, collectedAt: new Date().toISOString() };
    });
  }

  async createDirectory(parentPath: string, name: string) {
    return this.exclusive(async () => {
      await this.ensureStorage();
      return this.withStableDirectory(parentPath, async (parent) => {
        const targetName = cleanName(name); const target = join(parent.operationPath, targetName); const absolute = join(parent.absolutePath, targetName);
        await this.safety.assertStableDirectory(parent);
        try { await mkdir(target, { mode: 0o750 }); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ServiceError(409, "BAD_REQUEST", "同名项目已存在"); throw error; }
        try { await this.safety.assertStableDirectory(parent); }
        catch (error) { await rm(target, { recursive: true, force: true }).catch(() => undefined); throw error; }
        return this.toEntry(target, absolute);
      });
    });
  }

  async rename(path: string, name: string) {
    return this.exclusive(async () => {
      await this.ensureStorage(); const requested = this.safety.requestedPath(path);
      if (requested === this.root) throw new ServiceError(403, "FORBIDDEN", "不能重命名文件根目录");
      return this.safety.withStableParent(path, async (parent) => {
        const source = await this.safety.stableChild(parent, basename(requested));
        const targetName = cleanName(name); const target = join(parent.operationPath, targetName); const absolute = join(parent.absolutePath, targetName);
        await this.assertMissing(target); const info = await lstat(source.operationPath);
        if (!info.isFile()) throw new ServiceError(409, "BAD_REQUEST", "当前版本仅支持重命名普通文件");
        await this.safety.assertStableDirectory(parent);
        if (info.isFile()) {
          try { await link(source.operationPath, target); }
          catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ServiceError(409, "BAD_REQUEST", "同名项目已存在"); throw error; }
          try { await this.safety.assertStableDirectory(parent); await rm(source.operationPath); await this.safety.assertStableDirectory(parent); }
          catch (error) {
            try { await link(target, source.operationPath).catch((reason) => { if ((reason as NodeJS.ErrnoException).code !== "EEXIST") throw reason; }); await rm(target); }
            catch { /* Preserve both names rather than risk data loss. */ }
            throw error;
          }
        }
        return this.toEntry(target, absolute);
      });
    });
  }

  private async assertMissing(target: string) {
    try { await access(target, constants.F_OK); throw new ServiceError(409, "BAD_REQUEST", "同名项目已存在"); }
    catch (error) { if (error instanceof ServiceError) throw error; if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }

  private async readMetadata<T>(path: string, schema: z.ZodType<T>, label: string): Promise<T> {
    try { return schema.parse(JSON.parse(await readFile(path, "utf8")) as unknown); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return [] as T; throw metadataError(label); }
  }

  private async writeMetadata(path: string, value: unknown) {
    const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify(value, null, 2)); await handle.sync(); await handle.close(); await rename(temporary, path); await this.syncDirectory(dirname(path)); }
    catch (error) { await handle.close().catch(() => undefined); await rm(temporary, { force: true }); throw error; }
  }

  private trashMetadata() { return this.readMetadata(join(this.trashRoot, META_FILE), TrashMetadataSchema, "回收站"); }
  private saveTrash(rows: TrashMeta[]) { return this.writeMetadata(join(this.trashRoot, META_FILE), rows); }
  private uploadHistory() { return this.readMetadata(join(this.trashRoot, HISTORY_FILE), UploadHistorySchema, "上传历史"); }
  private saveUploadHistory(rows: FileUploadRecord[]) { return this.writeMetadata(join(this.trashRoot, HISTORY_FILE), rows.slice(0, 500)); }
  private transactionPath() { return join(this.trashRoot, TRANSACTION_FILE); }
  private saveTransaction(value: FileTransaction) { return this.writeMetadata(this.transactionPath(), value); }
  private async clearTransaction() { await rm(this.transactionPath(), { force: true }); await this.syncDirectory(this.trashRoot); }
  private async syncDirectory(path: string) { const handle = await open(path, "r"); try { await handle.sync(); } finally { await handle.close(); } }
  private async exists(path: string) { try { await lstat(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; } }
  private storedPath(row: TrashMeta) {
    const target = join(this.trashRoot, `${row.id}.data`);
    if (row.storedName !== `${row.id}.data` || !isWithin(this.trashRoot, target)) throw metadataError("回收站");
    return target;
  }

  private async recoverTransaction() {
    let transaction: FileTransaction;
    try { transaction = FileTransactionSchema.parse(JSON.parse(await readFile(this.transactionPath(), "utf8")) as unknown); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw metadataError("文件事务"); }
    if (transaction.operation === "trash") await this.recoverTrash(transaction.row);
    if (transaction.operation === "restore") await this.recoverRestore(transaction.row);
    if (transaction.operation === "purge") await this.finishPurge(transaction.rows);
    if (transaction.operation === "upload") await this.recoverUpload(transaction);
    await this.clearTransaction();
  }

  private async recoverTrash(row: TrashMeta) {
    const rows = await this.trashMetadata(); const stored = this.storedPath(row); const source = this.safety.requestedPath(row.originalPath);
    const [hasStored, hasSource] = await Promise.all([this.exists(stored), this.exists(source)]); const recorded = rows.some((item) => item.id === row.id);
    if (hasStored && !hasSource) { if (!recorded) await this.saveTrash([row, ...rows]); return; }
    if (!hasStored && hasSource && !recorded) return;
    throw metadataError("回收站恢复");
  }

  private async recoverRestore(row: TrashMeta) {
    const rows = await this.trashMetadata(); const stored = this.storedPath(row); const target = this.safety.requestedPath(row.originalPath);
    const [hasStored, hasTarget] = await Promise.all([this.exists(stored), this.exists(target)]); const recorded = rows.some((item) => item.id === row.id);
    if (!hasStored && hasTarget) { if (row.kind === "directory") await rm(restoreMarker(target, row.id), { force: true }); if (recorded) await this.saveTrash(rows.filter((item) => item.id !== row.id)); return; }
    if (hasStored && recorded) { await restoreWithoutOverwrite(stored, target, row, true); await this.saveTrash(rows.filter((item) => item.id !== row.id)); return; }
    throw metadataError("回收站恢复");
  }

  private async recoverUpload(transaction: Extract<FileTransaction, { operation: "upload" }>) {
    const target = this.safety.requestedPath(transaction.targetPath); const temporary = join(this.trashRoot, transaction.temporaryName);
    const [hasTarget, hasTemporary] = await Promise.all([this.exists(target), this.exists(temporary)]);
    if (!hasTarget && hasTemporary) await link(temporary, target);
    else if (!hasTarget) throw metadataError("上传事务");
    const history = await this.uploadHistory();
    if (!history.some((item) => item.id === transaction.upload.id)) await this.saveUploadHistory([transaction.upload, ...history]);
    await rm(temporary, { force: true });
  }

  private async reconcileTrashStorage() {
    const rows = await this.trashMetadata(); const expected = new Set(rows.map((row) => row.storedName));
    for (const row of rows) if (!await this.exists(this.storedPath(row))) throw metadataError("回收站");
    for (const entry of await readdir(this.trashRoot)) {
      if (/^[0-9a-f-]+\.data$/i.test(entry) && !expected.has(entry)) throw metadataError("回收站");
      if (entry.startsWith(".purge-") || /^\.upload-[0-9a-f-]+\.tmp$/i.test(entry)) await rm(join(this.trashRoot, entry), { recursive: true, force: true });
    }
  }

  private async finishPurge(rows: TrashMeta[]) {
    const metadata = await this.trashMetadata(); const ids = new Set(rows.map((row) => row.id));
    for (const row of rows) {
      const stored = this.storedPath(row); const quarantine = join(this.trashRoot, `.purge-${row.id}`);
      const hasStored = await this.exists(stored); const hasQuarantine = await this.exists(quarantine);
      if (hasStored && !hasQuarantine) { await rename(stored, quarantine); await this.syncDirectory(this.trashRoot); }
      else if (hasStored && hasQuarantine) throw metadataError("回收站清理");
    }
    await this.saveTrash(metadata.filter((row) => !ids.has(row.id)));
    for (const row of rows) await rm(join(this.trashRoot, `.purge-${row.id}`), { recursive: true, force: true });
  }

  private async purgeRows(rows: TrashMeta[]) {
    if (!rows.length) return;
    await this.saveTransaction({ operation: "purge", rows });
    await this.finishPurge(rows); await this.clearTransaction();
  }

  private async cleanupExpired() {
    const rows = await this.trashMetadata(); const now = Date.now();
    await this.purgeRows(rows.filter((row) => Date.parse(row.expiresAt) <= now));
  }

  async trash(path: string) {
    return this.exclusive(async () => {
      await this.ensureStorage(); const requested = this.safety.requestedPath(path);
      if (requested === this.root) throw new ServiceError(403, "FORBIDDEN", "不能删除文件根目录");
      return this.safety.withStableParent(path, async (parent) => {
        const source = await this.safety.stableChild(parent, basename(requested));
        const rows = await this.trashMetadata(); const info = await stat(source.operationPath); const id = randomUUID(); const storedName = `${id}.data`; const now = new Date();
        if (rows.length >= MAX_TRASH_ENTRIES) throw new ServiceError(409, "BAD_REQUEST", `回收站最多保留 ${MAX_TRASH_ENTRIES} 个文件项`);
        const row: TrashMeta = { id, name: basename(source.absolutePath), originalPath: this.safety.virtualPath(source.absolutePath), kind: info.isDirectory() ? "directory" : "file", sizeBytes: info.isDirectory() ? null : info.size, deletedAt: now.toISOString(), expiresAt: new Date(now.getTime() + TRASH_RETENTION_MS).toISOString(), owner: ownerLabel(info.uid), storedName };
        const stored = this.storedPath(row); await this.saveTransaction({ operation: "trash", row }); await rename(source.operationPath, stored);
        try { await Promise.all([this.syncDirectory(parent.operationPath), this.syncDirectory(this.trashRoot)]); await this.safety.assertStableDirectory(parent); await this.saveTrash([row, ...rows]); await this.clearTransaction(); }
        catch (error) { try { await rename(stored, source.operationPath); await this.clearTransaction(); } catch { /* Leave the journal for startup recovery. */ } throw error; }
        return { id: row.id, name: row.name, originalPath: row.originalPath, kind: row.kind, sizeBytes: row.sizeBytes, deletedAt: row.deletedAt, expiresAt: row.expiresAt, owner: row.owner };
      });
    });
  }

  async listTrash() {
    await this.ensureStorage();
    const entries = (await this.trashMetadata()).map((row) => ({ id: row.id, name: row.name, originalPath: row.originalPath, kind: row.kind, sizeBytes: row.sizeBytes, deletedAt: row.deletedAt, expiresAt: row.expiresAt, owner: row.owner }));
    return { entries, collectedAt: new Date().toISOString() };
  }

  async restore(id: string) {
    return this.exclusive(async () => {
      await this.ensureStorage(); const rows = await this.trashMetadata(); const row = rows.find((item) => item.id === id);
      if (!row) throw new ServiceError(404, "NOT_FOUND", "回收站项目不存在");
      return this.safety.withStableParent(row.originalPath, async (parent, target) => {
        const stored = this.storedPath(row); await this.saveTransaction({ operation: "restore", row });
        try { await restoreWithoutOverwrite(stored, target.operationPath, row); }
        catch (error) { if (isCleanRestoreConflict(error) && await this.exists(stored)) await this.clearTransaction(); throw error; }
        await Promise.all([this.syncDirectory(this.trashRoot), this.syncDirectory(parent.operationPath)]); await this.safety.assertStableDirectory(parent); await this.saveTrash(rows.filter((item) => item.id !== id)); await this.clearTransaction();
        return this.toEntry(target.operationPath, target.absolutePath);
      });
    });
  }

  async purge(id: string) {
    return this.exclusive(async () => {
      await this.ensureStorage(); const rows = await this.trashMetadata(); const row = rows.find((item) => item.id === id);
      if (!row) throw new ServiceError(404, "NOT_FOUND", "回收站项目不存在");
      await this.purgeRows([row]);
    });
  }

  async emptyTrash() {
    return this.exclusive(async () => {
      await this.ensureStorage(); const rows = await this.trashMetadata(); await this.purgeRows(rows); return rows.length;
    });
  }

  async listUploads() {
    await this.ensureStorage(); return { uploads: await this.uploadHistory(), collectedAt: new Date().toISOString(), maxUploadBytes: this.maxUploadBytes };
  }

  async upload(targetPath: string, name: string, content: AsyncIterable<Buffer | string>, owner: string, contentLength?: number) {
    if (contentLength !== undefined && contentLength > this.maxUploadBytes) throw new ServiceError(413, "PAYLOAD_TOO_LARGE", `上传文件不能超过 ${this.maxUploadBytes} 字节`);
    return this.exclusive(async () => {
      await this.ensureStorage();
      return this.withStableDirectory(targetPath, async (parent) => {
        const clean = cleanName(name); const id = randomUUID(); const temporaryName = `.upload-${id}.tmp`; const temporary = join(this.trashRoot, temporaryName); const startedAt = new Date().toISOString(); let sizeBytes = 0;
        const handle = await open(temporary, "wx", 0o600);
        try {
        for await (const value of content) {
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value); sizeBytes += chunk.length;
          if (sizeBytes > this.maxUploadBytes) throw new ServiceError(413, "PAYLOAD_TOO_LARGE", `上传文件不能超过 ${this.maxUploadBytes} 字节`);
          let offset = 0;
          while (offset < chunk.length) {
            const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset);
            if (!bytesWritten) throw new ServiceError(500, "INTERNAL_ERROR", "上传文件写入失败");
            offset += bytesWritten;
          }
        }
        await handle.sync(); await handle.close(); await chmod(temporary, 0o640); await this.syncDirectory(this.trashRoot);
        const target = join(parent.operationPath, clean); const absolute = join(parent.absolutePath, clean); await this.assertMissing(target);
        await this.safety.assertStableDirectory(parent);
        const completedAt = new Date().toISOString();
        const upload: FileUploadRecord = { id, name: clean, targetPath, sizeBytes, status: "completed", owner: owner.slice(0, 128), startedAt, completedAt, error: null };
        await this.saveTransaction({ operation: "upload", targetPath: this.safety.virtualPath(absolute), temporaryName, upload }); let published = false; let historyCommitted = false;
        try {
          try { await link(temporary, target); published = true; await this.safety.assertStableDirectory(parent); await this.syncDirectory(parent.operationPath); }
          catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ServiceError(409, "BAD_REQUEST", "目标路径已存在同名文件"); throw error; }
          await this.saveUploadHistory([upload, ...await this.uploadHistory()]); historyCommitted = true; await rm(temporary, { force: true }); await this.clearTransaction();
        } catch (error) {
          if (!historyCommitted) { if (published) { await rm(target, { force: true }); await this.syncDirectory(parent.operationPath).catch(() => undefined); } await this.clearTransaction().catch(() => undefined); }
          else { (error as { uploadCommitted?: boolean }).uploadCommitted = true; }
          throw error;
        }
        return { upload, entry: await this.toEntry(target, absolute) };
      } catch (error) {
        await handle.close().catch(() => undefined); await rm(temporary, { force: true });
        if ((error as { uploadCommitted?: boolean }).uploadCommitted) throw error;
        const completedAt = new Date().toISOString(); const message = error instanceof Error ? error.message.slice(0, 240) : "上传失败";
        const failed: FileUploadRecord = { id, name: clean, targetPath, sizeBytes, status: "failed", owner: owner.slice(0, 128), startedAt, completedAt, error: message };
        await this.saveUploadHistory([failed, ...await this.uploadHistory()]).catch(() => undefined); throw error;
        }
      });
    });
  }
}
