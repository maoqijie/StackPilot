import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, link, mkdir, open, readFile, readdir, realpath, rename, rm, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import type { FileEntry, FileListPayload } from "@stackpilot/contracts";
import { ServiceError } from "../serviceError.js";
import type { FileTrashRepository } from "./fileTrashRepository.js";

type RootMatch = { configuredRoot: string; realRoot: string; absolutePath: string };
type StableDirectory = RootMatch & { operationPath: string };
type TrashLocation = { trashRoot: string; bucketPath: string; itemPath: string };
export type TrashPurgeStage = { originalBucketPath: string; stagedBucketPath: string };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isInside(root: string, candidate: string): boolean {
  const value = relative(root, candidate);
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`));
}

function validName(value: string): string {
  const name = value.trim();
  const control = [...name].some((character) => character.charCodeAt(0) < 32);
  if (!name || name === "." || name === ".." || name === ".stackpilot-trash" || /[\\/]/.test(name) || control) {
    throw new ServiceError(400, "BAD_REQUEST", "文件名无效");
  }
  return name;
}

export class FileService {
  private owners: Map<number, string> | null = null;
  private mutation = Promise.resolve();

  constructor(private readonly roots: readonly string[], private readonly trashRepository?: FileTrashRepository) {
    if (!roots.length || roots.some((root) => !isAbsolute(root))) throw new Error("文件根目录必须是绝对路径");
  }

  defaultRoot(): string { return resolve(this.roots[0]!); }

  private async mutate<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutation;
    let release!: () => void;
    this.mutation = new Promise<void>((resolvePromise) => { release = resolvePromise; });
    await previous;
    try { return await operation(); }
    finally { release(); }
  }

  private normalized(value: string): string {
    if (!isAbsolute(value) || value.includes("\0")) throw new ServiceError(400, "BAD_REQUEST", "文件路径无效");
    const path = normalize(value);
    if (path.split(sep).includes(".stackpilot-trash")) throw new ServiceError(403, "FORBIDDEN", "文件回收目录不可直接访问");
    return path;
  }

  private async rootFor(path: string): Promise<{ configuredRoot: string; realRoot: string }> {
    const matches = await Promise.all(this.roots.map(async (item) => {
      const configuredRoot = resolve(item);
      try {
        const realRoot = await realpath(configuredRoot);
        return isInside(configuredRoot, path) || isInside(realRoot, path) ? { configuredRoot, realRoot } : null;
      } catch { return null; }
    }));
    const root = matches
      .filter((item): item is { configuredRoot: string; realRoot: string } => Boolean(item))
      .sort((a, b) => b.realRoot.length - a.realRoot.length)[0];
    if (!root) throw new ServiceError(403, "FORBIDDEN", "文件路径超出允许范围");
    return root;
  }

  private async existing(value: string): Promise<RootMatch> {
    const absolutePath = this.normalized(value);
    const { configuredRoot, realRoot } = await this.rootFor(absolutePath);
    let realTarget: string;
    try { realTarget = await realpath(absolutePath); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new ServiceError(404, "NOT_FOUND", "文件或目录不存在");
      throw error;
    }
    const base = isInside(configuredRoot, absolutePath) ? configuredRoot : realRoot;
    const expected = join(realRoot, relative(base, absolutePath));
    if (!isInside(realRoot, realTarget) || realTarget !== expected) {
      throw new ServiceError(403, "FORBIDDEN", "文件路径包含不受信任的符号链接");
    }
    return { configuredRoot, realRoot, absolutePath: realTarget };
  }

  private async withOpenedDirectory<T>(match: RootMatch, openPath: string, operation: (directory: StableDirectory) => Promise<T>): Promise<T> {
    const handle = await open(openPath, constants.O_RDONLY | constants.O_DIRECTORY | (constants.O_NOFOLLOW ?? 0));
    try {
      if (!(await handle.stat()).isDirectory()) throw new ServiceError(400, "BAD_REQUEST", "请求路径不是目录");
      const directory = { ...match, operationPath: process.platform === "linux" ? `/proc/self/fd/${handle.fd}` : match.absolutePath };
      await this.assertStableDirectory(directory);
      return await operation(directory);
    } finally { await handle.close(); }
  }

  private async assertStableDirectory(directory: StableDirectory): Promise<void> {
    if (process.platform !== "linux") return;
    let openedPath: string;
    try { openedPath = await realpath(directory.operationPath); }
    catch { throw new ServiceError(409, "BAD_REQUEST", "目录在操作前发生变化，请重试"); }
    if (openedPath !== directory.absolutePath || !isInside(directory.realRoot, openedPath)) {
      throw new ServiceError(409, "BAD_REQUEST", "目录在操作前发生变化，请重试");
    }
  }

  private async withStableDirectory<T>(value: string, operation: (directory: StableDirectory) => Promise<T>): Promise<T> {
    const match = await this.existing(value);
    return this.withOpenedDirectory(match, match.absolutePath, operation);
  }

  private async stableChild(parent: StableDirectory, name: string): Promise<RootMatch> {
    const publicPath = join(parent.absolutePath, name);
    let realTarget: string;
    try { realTarget = await realpath(join(parent.operationPath, name)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new ServiceError(404, "NOT_FOUND", "文件或目录不存在");
      throw error;
    }
    if (realTarget !== publicPath || !isInside(parent.realRoot, realTarget)) {
      throw new ServiceError(403, "FORBIDDEN", "文件路径包含不受信任的符号链接");
    }
    return { configuredRoot: parent.configuredRoot, realRoot: parent.realRoot, absolutePath: publicPath };
  }

  private async owner(uid: number): Promise<string> {
    if (!this.owners) {
      this.owners = new Map();
      try {
        for (const line of (await readFile("/etc/passwd", "utf8")).split("\n")) {
          const row = line.split(":");
          const id = Number(row[2]);
          if (row[0] && Number.isInteger(id)) this.owners.set(id, row[0]);
        }
      } catch { /* Numeric UID fallback. */ }
    }
    return this.owners.get(uid) ?? `UID ${uid}`;
  }

  private async entry(operationPath: string, publicPath: string, parentPath = dirname(publicPath)): Promise<FileEntry> {
    const stats = await lstat(operationPath);
    const kind = stats.isDirectory() ? "directory" : stats.isSymbolicLink() ? "symlink" : "file";
    return {
      id: createHash("sha256").update(publicPath).digest("hex"), name: basename(publicPath), kind, path: publicPath, parentPath,
      sizeBytes: kind === "file" ? stats.size : null, modifiedAt: stats.mtime.toISOString(), owner: await this.owner(stats.uid),
    };
  }

  async list(value: string): Promise<FileListPayload> {
    return this.withStableDirectory(value, async (directory) => {
      await this.assertStableDirectory(directory);
      const names = (await readdir(directory.operationPath)).filter((name) => name !== ".stackpilot-trash");
      if (names.length > 5000) throw new ServiceError(413, "PAYLOAD_TOO_LARGE", "目录项目超过 5000 个");
      const entries = await Promise.all(names.map((name) => this.entry(join(directory.operationPath, name), join(directory.absolutePath, name), directory.absolutePath)));
      await this.assertStableDirectory(directory);
      entries.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "directory" ? -1 : 1);
      return {
        rootPath: directory.configuredRoot, path: directory.absolutePath,
        parentPath: directory.absolutePath === directory.realRoot ? null : dirname(directory.absolutePath), entries,
        collectedAt: new Date().toISOString(), writable: await access(directory.operationPath, constants.W_OK).then(() => true, () => false),
      };
    });
  }

  async createDirectory(path: string, name: string): Promise<FileEntry> {
    return this.mutate(() => this.withStableDirectory(path, async (parent) => {
      const childName = validName(name), operationPath = join(parent.operationPath, childName), publicPath = join(parent.absolutePath, childName);
      await this.assertStableDirectory(parent);
      try { await mkdir(operationPath, { mode: 0o775 }); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ServiceError(409, "BAD_REQUEST", "同名项目已存在");
        throw error;
      }
      const handle = await open(operationPath, constants.O_RDONLY | constants.O_DIRECTORY | (constants.O_NOFOLLOW ?? 0));
      try { await handle.chmod(0o775); } finally { await handle.close(); }
      try { await this.assertStableDirectory(parent); } catch (error) { await rm(operationPath).catch(() => undefined); throw error; }
      return this.entry(operationPath, publicPath, parent.absolutePath);
    }));
  }

  async upload(path: string, name: string, content: Buffer): Promise<FileEntry> {
    return this.mutate(() => this.withStableDirectory(path, async (parent) => {
      const childName = validName(name), operationPath = join(parent.operationPath, childName), publicPath = join(parent.absolutePath, childName);
      await this.assertStableDirectory(parent);
      let handle;
      try { handle = await open(operationPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o664); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ServiceError(409, "BAD_REQUEST", "同名项目已存在");
        throw error;
      }
      try { await handle.writeFile(content); await handle.chmod(0o664); } finally { await handle.close(); }
      try { await this.assertStableDirectory(parent); } catch (error) { await rm(operationPath, { force: true }).catch(() => undefined); throw error; }
      return this.entry(operationPath, publicPath, parent.absolutePath);
    }));
  }

  async rename(path: string, newName: string): Promise<FileEntry> {
    return this.mutate(() => this.withStableDirectory(dirname(this.normalized(path)), async (parent) => {
      const sourceName = basename(path), source = await this.stableChild(parent, sourceName);
      if (source.absolutePath === source.realRoot) throw new ServiceError(403, "FORBIDDEN", "不能重命名文件根目录");
      const sourceOperationPath = join(parent.operationPath, sourceName);
      if (!(await lstat(sourceOperationPath)).isFile()) throw new ServiceError(409, "BAD_REQUEST", "当前版本仅支持重命名普通文件");
      const targetName = validName(newName), targetOperationPath = join(parent.operationPath, targetName);
      await this.assertStableDirectory(parent);
      try { await link(sourceOperationPath, targetOperationPath); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ServiceError(409, "BAD_REQUEST", "同名项目已存在");
        throw error;
      }
      try { await this.assertStableDirectory(parent); await unlink(sourceOperationPath); await this.assertStableDirectory(parent); }
      catch (error) {
        try {
          await link(targetOperationPath, sourceOperationPath).catch((reason) => { if ((reason as NodeJS.ErrnoException).code !== "EEXIST") throw reason; });
          await unlink(targetOperationPath);
        } catch { /* Preserve both names rather than risking data loss. */ }
        throw error;
      }
      return this.entry(targetOperationPath, join(parent.absolutePath, targetName), parent.absolutePath);
    }));
  }

  async moveToTrash(path: string, actor = "unknown"): Promise<string> {
    return this.mutate(() => this.withStableDirectory(dirname(this.normalized(path)), async (parent) => {
      const sourceName = basename(path), source = await this.stableChild(parent, sourceName);
      if (source.absolutePath === source.realRoot) throw new ServiceError(403, "FORBIDDEN", "不能删除文件根目录");
      const sourceOperationPath = join(parent.operationPath, sourceName), file = await this.entry(sourceOperationPath, source.absolutePath);
      await this.assertStableDirectory(parent);
      return this.withStableDirectory(source.realRoot, async (root) => {
        const trashPath = join(root.absolutePath, ".stackpilot-trash"), trashOperationPath = join(root.operationPath, ".stackpilot-trash");
        await this.assertStableDirectory(root);
        try { const stats = await lstat(trashOperationPath); if (!stats.isDirectory() || stats.isSymbolicLink()) throw new ServiceError(403, "FORBIDDEN", "文件回收目录不安全"); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; await mkdir(trashOperationPath, { mode: 0o700 }); }
        return this.withOpenedDirectory({ configuredRoot: root.configuredRoot, realRoot: root.realRoot, absolutePath: trashPath }, trashOperationPath, async (trash) => {
          const id = randomUUID(), bucket = join(trash.operationPath, id), itemOperationPath = join(bucket, sourceName), itemPath = join(trash.absolutePath, id, sourceName);
          await this.assertStableDirectory(parent); await this.assertStableDirectory(trash); await mkdir(bucket, { mode: 0o700 });
          try {
            await rename(sourceOperationPath, itemOperationPath); await this.assertStableDirectory(parent); await this.assertStableDirectory(trash);
            const deletedAt = new Date().toISOString();
            this.trashRepository?.create({ id, name: file.name, kind: file.kind === "directory" ? "directory" : "file", originalPath: source.absolutePath, sizeBytes: file.sizeBytes, deletedAt, expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), owner: actor, reason: "从文件管理删除" }, itemPath);
          } catch (error) {
            await rename(itemOperationPath, sourceOperationPath).catch(() => undefined);
            await rm(bucket, { recursive: true, force: true }).catch(() => undefined);
            throw error;
          }
          return sourceName;
        });
      });
    }));
  }

  private async trashLocation(trashPath: string, requireItem = true): Promise<TrashLocation> {
    if (!isAbsolute(trashPath) || trashPath.includes("\0")) throw new ServiceError(403, "FORBIDDEN", "回收站存储路径无效");
    const itemPath = normalize(trashPath), bucketPath = dirname(itemPath), trashRoot = dirname(bucketPath);
    if (basename(trashRoot) !== ".stackpilot-trash" || !UUID_PATTERN.test(basename(bucketPath))) throw new ServiceError(403, "FORBIDDEN", "回收站存储路径无效");
    const root = await this.rootFor(dirname(trashRoot));
    if (trashRoot !== join(root.realRoot, ".stackpilot-trash")) throw new ServiceError(403, "FORBIDDEN", "回收站存储路径无效");
    try {
      if (await realpath(trashRoot) !== trashRoot || !await this.safeDirectory(bucketPath)) throw new ServiceError(403, "FORBIDDEN", "回收站存储路径不安全");
      if (await realpath(itemPath) !== itemPath || dirname(itemPath) !== bucketPath) throw new ServiceError(403, "FORBIDDEN", "回收站存储路径不安全");
    } catch (error) {
      if (!requireItem && (error as NodeJS.ErrnoException).code === "ENOENT") return { trashRoot, bucketPath, itemPath };
      throw error;
    }
    return { trashRoot, bucketPath, itemPath };
  }

  private async trashPurgePaths(trashPath: string): Promise<{ trashRoot: string } & TrashPurgeStage> {
    if (!isAbsolute(trashPath) || trashPath.includes("\0")) throw new ServiceError(403, "FORBIDDEN", "回收站存储路径无效");
    const originalBucketPath = dirname(normalize(trashPath)), trashRoot = dirname(originalBucketPath), bucketId = basename(originalBucketPath);
    if (basename(trashRoot) !== ".stackpilot-trash" || !UUID_PATTERN.test(bucketId)) throw new ServiceError(403, "FORBIDDEN", "回收站存储路径无效");
    const root = await this.rootFor(dirname(trashRoot));
    if (trashRoot !== join(root.realRoot, ".stackpilot-trash")) throw new ServiceError(403, "FORBIDDEN", "回收站存储路径无效");
    return { trashRoot, originalBucketPath, stagedBucketPath: join(trashRoot, `.purging-${bucketId}`) };
  }

  private async safeDirectory(path: string): Promise<boolean> {
    const stats = await lstat(path);
    return stats.isDirectory() && !stats.isSymbolicLink() && await realpath(path) === path;
  }

  async restoreFromTrash(originalPath: string, trashPath: string): Promise<void> {
    return this.mutate(async () => {
      const location = await this.trashLocation(trashPath), targetPath = this.normalized(originalPath);
      await this.withStableDirectory(dirname(targetPath), async (parent) => {
        const target = join(parent.operationPath, basename(targetPath));
        if (join(parent.absolutePath, basename(targetPath)) !== targetPath) throw new ServiceError(403, "FORBIDDEN", "文件路径超出允许范围");
        try { await lstat(target); throw new ServiceError(409, "BAD_REQUEST", "原路径已存在同名项目"); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        await this.assertStableDirectory(parent); await rename(location.itemPath, target); await this.assertStableDirectory(parent);
      });
    });
  }

  async completeTrashRestore(trashPath: string): Promise<void> { return this.mutate(async () => { await rm((await this.trashLocation(trashPath, false)).bucketPath, { recursive: true, force: true }); }); }
  async rollbackTrashRestore(originalPath: string, trashPath: string): Promise<void> {
    return this.mutate(async () => {
      const location = await this.trashLocation(trashPath, false), sourcePath = this.normalized(originalPath);
      await this.withStableDirectory(dirname(sourcePath), async (parent) => {
        await mkdir(location.bucketPath, { mode: 0o700, recursive: true });
        try { await this.assertStableDirectory(parent); await rename(join(parent.operationPath, basename(sourcePath)), location.itemPath); }
        catch (error) { await rm(location.bucketPath, { recursive: true, force: true }); throw error; }
      });
    });
  }

  async stageTrashPurge(trashPath: string): Promise<TrashPurgeStage | null> {
    return this.mutate(async () => {
      const paths = await this.trashPurgePaths(trashPath);
      try { if (!await this.safeDirectory(paths.trashRoot)) throw new ServiceError(403, "FORBIDDEN", "回收站存储路径不安全"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
      try {
        if (!await this.safeDirectory(paths.originalBucketPath)) throw new ServiceError(403, "FORBIDDEN", "回收站存储路径不安全");
        try { await lstat(paths.stagedBucketPath); throw new ServiceError(409, "BAD_REQUEST", "回收站清理状态冲突"); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        await rename(paths.originalBucketPath, paths.stagedBucketPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        try { if (!await this.safeDirectory(paths.stagedBucketPath)) throw new ServiceError(403, "FORBIDDEN", "回收站存储路径不安全"); }
        catch (stagedError) { if ((stagedError as NodeJS.ErrnoException).code === "ENOENT") return null; throw stagedError; }
      }
      return { originalBucketPath: paths.originalBucketPath, stagedBucketPath: paths.stagedBucketPath };
    });
  }

  async rollbackTrashPurge(stage: TrashPurgeStage): Promise<void> {
    return this.mutate(async () => {
      try { if (!await this.safeDirectory(stage.stagedBucketPath)) throw new ServiceError(403, "FORBIDDEN", "回收站存储路径不安全"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
      try { await lstat(stage.originalBucketPath); throw new ServiceError(409, "BAD_REQUEST", "回收站清理回滚冲突"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      await rename(stage.stagedBucketPath, stage.originalBucketPath);
    });
  }

  async completeTrashPurge(stage: TrashPurgeStage): Promise<void> {
    return this.mutate(async () => {
      try { if (!await this.safeDirectory(stage.stagedBucketPath)) throw new ServiceError(403, "FORBIDDEN", "回收站存储路径不安全"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
      await rm(stage.stagedBucketPath, { recursive: true, force: true });
    });
  }
}
