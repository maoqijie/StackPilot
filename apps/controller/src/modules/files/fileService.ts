import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, link, lstat, mkdir, open, readdir, readFile, realpath, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import {
  FileUploadRecordSchema, TrashFileEntrySchema,
  type FileEntry, type FileUploadRecord,
} from "@stackpilot/contracts";
import { z } from "zod";
import { ServiceError } from "../serviceError.js";

const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const META_FILE = ".stackpilot-trash.json";
const HISTORY_FILE = ".stackpilot-uploads.json";
const TrashMetaSchema = TrashFileEntrySchema.extend({ storedName: z.string() }).strict().superRefine((row, context) => {
  if (row.storedName !== `${row.id}.data`) context.addIssue({ code: "custom", message: "回收站存储名称无效" });
});
const TrashMetadataSchema = z.array(TrashMetaSchema).max(10_000);
const UploadHistorySchema = z.array(FileUploadRecordSchema).max(500);
type TrashMeta = z.infer<typeof TrashMetaSchema>;

function ownerLabel(uid: number) { return `uid:${uid}`; }
function entryId(path: string, info: { dev: number | bigint; ino: number | bigint }) {
  return createHash("sha256").update(`${info.dev}:${info.ino}:${path}`).digest("hex");
}
function cleanName(name: string) {
  if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\") || name.includes("\0")) throw new ServiceError(400, "BAD_REQUEST", "文件名无效");
  return name;
}
function isWithin(root: string, candidate: string) {
  const value = relative(root, candidate); return value === "" || (!value.startsWith("..") && !isAbsolute(value));
}
function metadataError(label: string) { return new ServiceError(500, "INTERNAL_ERROR", `${label}元数据损坏`); }

export class FileService {
  private readonly root: string;
  private readonly trashRoot: string;
  private storageReady: Promise<void> | null = null;
  private mutationQueue = Promise.resolve();

  constructor(root: string, trashRoot: string, readonly maxUploadBytes: number, repoRoot: string) {
    this.root = isAbsolute(root) ? normalize(root) : resolve(repoRoot, root);
    this.trashRoot = isAbsolute(trashRoot) ? normalize(trashRoot) : resolve(repoRoot, trashRoot);
    if (isWithin(this.root, this.trashRoot) || isWithin(this.trashRoot, this.root)) throw new Error("文件根目录与回收站目录必须彼此隔离");
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
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation);
    this.mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private virtualPath(absolute: string) {
    const value = relative(this.root, absolute).split(sep).join("/"); return value ? `/${value}` : "/";
  }

  private requestedPath(path: string) {
    if (!path.startsWith("/") || path.includes("\0")) throw new ServiceError(400, "BAD_REQUEST", "路径必须是绝对虚拟路径");
    const candidate = resolve(this.root, `.${path}`);
    if (!isWithin(this.root, candidate)) throw new ServiceError(403, "FORBIDDEN", "路径超出受管文件根目录");
    return candidate;
  }

  private async assertExisting(path: string) {
    const candidate = this.requestedPath(path);
    let resolved: string; let canonicalRoot: string;
    try {
      canonicalRoot = await realpath(this.root);
      if ((await lstat(candidate)).isSymbolicLink()) throw new ServiceError(403, "FORBIDDEN", "不允许访问符号链接");
      resolved = await realpath(candidate);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(404, "NOT_FOUND", "文件或目录不存在");
    }
    const expected = resolve(canonicalRoot, relative(this.root, candidate));
    if (!isWithin(canonicalRoot, resolved) || resolved !== expected) throw new ServiceError(403, "FORBIDDEN", "路径包含符号链接或超出受管文件根目录");
    return candidate;
  }

  private async assertParent(path: string) {
    const candidate = this.requestedPath(path);
    let parent: string; let canonicalRoot: string;
    try { canonicalRoot = await realpath(this.root); parent = await realpath(dirname(candidate)); }
    catch { throw new ServiceError(404, "NOT_FOUND", "父目录不存在"); }
    const expected = resolve(canonicalRoot, relative(this.root, dirname(candidate)));
    if (!isWithin(canonicalRoot, parent) || parent !== expected) throw new ServiceError(403, "FORBIDDEN", "父目录包含符号链接或超出受管文件根目录");
    return candidate;
  }

  private async toEntry(absolute: string): Promise<FileEntry> {
    const info = await stat(absolute);
    return { id: entryId(absolute, info), name: basename(absolute), path: this.virtualPath(absolute), kind: info.isDirectory() ? "directory" : "file", sizeBytes: info.isDirectory() ? null : info.size, modifiedAt: info.mtime.toISOString(), owner: ownerLabel(info.uid) };
  }

  async list(path: string) {
    await this.ensureStorage();
    const directory = await this.assertExisting(path);
    if (!(await stat(directory)).isDirectory()) throw new ServiceError(400, "BAD_REQUEST", "目标路径不是目录");
    const rows = await readdir(directory, { withFileTypes: true });
    if (rows.length > 10_000) throw new ServiceError(409, "BAD_REQUEST", "目录项目超过 10000 个，拒绝展示");
    const entries: FileEntry[] = [];
    for (const row of rows) {
      if (row.isSymbolicLink() || (!row.isDirectory() && !row.isFile())) continue;
      entries.push(await this.toEntry(join(directory, row.name)));
    }
    entries.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name, "zh-Hans-CN") : a.kind === "directory" ? -1 : 1);
    return { root: "/", path: this.virtualPath(directory), entries, collectedAt: new Date().toISOString() };
  }

  async createDirectory(parentPath: string, name: string) {
    return this.exclusive(async () => {
      await this.ensureStorage(); const parent = await this.assertExisting(parentPath); const target = join(parent, cleanName(name));
      if (!isWithin(this.root, target)) throw new ServiceError(403, "FORBIDDEN", "路径超出受管文件根目录");
      try { await mkdir(target, { mode: 0o750 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ServiceError(409, "BAD_REQUEST", "同名项目已存在"); throw error; }
      return this.toEntry(target);
    });
  }

  async rename(path: string, name: string) {
    return this.exclusive(async () => {
      await this.ensureStorage(); const source = await this.assertExisting(path);
      if (source === this.root) throw new ServiceError(403, "FORBIDDEN", "不能重命名文件根目录");
      const target = join(dirname(source), cleanName(name)); await this.assertMissing(target);
      const info = await lstat(source);
      if (info.isFile()) {
        try { await link(source, target); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ServiceError(409, "BAD_REQUEST", "同名项目已存在"); throw error; }
        try { await rm(source); } catch (error) { await rm(target, { force: true }); throw error; }
      } else {
        await rename(source, target);
      }
      return this.toEntry(target);
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
    try { await handle.writeFile(JSON.stringify(value, null, 2)); await handle.sync(); await handle.close(); await rename(temporary, path); }
    catch (error) { await handle.close().catch(() => undefined); await rm(temporary, { force: true }); throw error; }
  }

  private trashMetadata() { return this.readMetadata(join(this.trashRoot, META_FILE), TrashMetadataSchema, "回收站"); }
  private saveTrash(rows: TrashMeta[]) { return this.writeMetadata(join(this.trashRoot, META_FILE), rows); }
  private uploadHistory() { return this.readMetadata(join(this.trashRoot, HISTORY_FILE), UploadHistorySchema, "上传历史"); }
  private saveUploadHistory(rows: FileUploadRecord[]) { return this.writeMetadata(join(this.trashRoot, HISTORY_FILE), rows.slice(0, 500)); }
  private storedPath(row: TrashMeta) {
    const target = join(this.trashRoot, `${row.id}.data`);
    if (row.storedName !== `${row.id}.data` || !isWithin(this.trashRoot, target)) throw metadataError("回收站");
    return target;
  }

  async trash(path: string) {
    return this.exclusive(async () => {
      await this.ensureStorage(); const source = await this.assertExisting(path);
      if (source === this.root) throw new ServiceError(403, "FORBIDDEN", "不能删除文件根目录");
      const rows = await this.trashMetadata(); const info = await stat(source); const id = randomUUID(); const storedName = `${id}.data`; const now = new Date();
      const row: TrashMeta = { id, name: basename(source), originalPath: this.virtualPath(source), kind: info.isDirectory() ? "directory" : "file", sizeBytes: info.isDirectory() ? null : info.size, deletedAt: now.toISOString(), expiresAt: new Date(now.getTime() + TRASH_RETENTION_MS).toISOString(), owner: ownerLabel(info.uid), storedName };
      const stored = this.storedPath(row); await rename(source, stored);
      try { await this.saveTrash([row, ...rows]); }
      catch (error) { await rename(stored, source).catch(() => undefined); throw error; }
      return { id: row.id, name: row.name, originalPath: row.originalPath, kind: row.kind, sizeBytes: row.sizeBytes, deletedAt: row.deletedAt, expiresAt: row.expiresAt, owner: row.owner };
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
      const target = await this.assertParent(row.originalPath); await this.assertMissing(target); const stored = this.storedPath(row);
      await rename(stored, target);
      try { await this.saveTrash(rows.filter((item) => item.id !== id)); }
      catch (error) { await rename(target, stored).catch(() => undefined); throw error; }
      return this.toEntry(target);
    });
  }

  async purge(id: string) {
    return this.exclusive(async () => {
      await this.ensureStorage(); const rows = await this.trashMetadata(); const row = rows.find((item) => item.id === id);
      if (!row) throw new ServiceError(404, "NOT_FOUND", "回收站项目不存在");
      const stored = this.storedPath(row); const quarantine = join(this.trashRoot, `.purge-${row.id}`); await rename(stored, quarantine);
      try { await this.saveTrash(rows.filter((item) => item.id !== id)); await rm(quarantine, { recursive: true, force: true }); }
      catch (error) { await rename(quarantine, stored).catch(() => undefined); await this.saveTrash(rows).catch(() => undefined); throw error; }
    });
  }

  async emptyTrash() {
    return this.exclusive(async () => {
      await this.ensureStorage(); const rows = await this.trashMetadata(); const moved: Array<{ stored: string; quarantine: string }> = [];
      try {
        for (const row of rows) { const stored = this.storedPath(row); const quarantine = join(this.trashRoot, `.purge-${row.id}`); await rename(stored, quarantine); moved.push({ stored, quarantine }); }
        await this.saveTrash([]);
        for (const item of moved) await rm(item.quarantine, { recursive: true, force: true });
        return rows.length;
      } catch (error) {
        for (const item of moved.reverse()) await rename(item.quarantine, item.stored).catch(() => undefined);
        await this.saveTrash(rows).catch(() => undefined); throw error;
      }
    });
  }

  async listUploads() {
    await this.ensureStorage(); return { uploads: await this.uploadHistory(), collectedAt: new Date().toISOString(), maxUploadBytes: this.maxUploadBytes };
  }

  async upload(targetPath: string, name: string, content: AsyncIterable<Buffer | string>, owner: string, contentLength?: number) {
    if (contentLength !== undefined && contentLength > this.maxUploadBytes) throw new ServiceError(413, "PAYLOAD_TOO_LARGE", `上传文件不能超过 ${this.maxUploadBytes} 字节`);
    return this.exclusive(async () => {
      await this.ensureStorage(); const parent = await this.assertExisting(targetPath);
      if (!(await stat(parent)).isDirectory()) throw new ServiceError(400, "BAD_REQUEST", "目标路径不是目录");
      const clean = cleanName(name); const id = randomUUID(); const temporary = join(parent, `.stackpilot-upload-${id}.tmp`); const startedAt = new Date().toISOString(); let sizeBytes = 0;
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
        await handle.sync(); await handle.close(); await chmod(temporary, 0o640);
        const target = join(parent, clean); await this.assertMissing(target);
        try { await link(temporary, target); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ServiceError(409, "BAD_REQUEST", "目标路径已存在同名文件"); throw error; }
        await rm(temporary, { force: true });
        const completedAt = new Date().toISOString();
        const upload: FileUploadRecord = { id, name: clean, targetPath, sizeBytes, status: "completed", owner: owner.slice(0, 128), startedAt, completedAt, error: null };
        try { await this.saveUploadHistory([upload, ...await this.uploadHistory()]); }
        catch (error) { await rm(target, { force: true }); throw error; }
        return { upload, entry: await this.toEntry(target) };
      } catch (error) {
        await handle.close().catch(() => undefined); await rm(temporary, { force: true }); throw error;
      }
    });
  }
}
