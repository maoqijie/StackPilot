import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import type { FileEntry, FileListPayload } from "@stackpilot/contracts";
import { ServiceError } from "../serviceError.js";

type RootMatch = { configuredRoot: string; realRoot: string; absolutePath: string };
type StableDirectory = RootMatch & { operationPath: string };

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

  constructor(private readonly roots: readonly string[]) {
    if (!roots.length || roots.some((root) => !isAbsolute(root))) throw new Error("文件根目录必须是绝对路径");
  }

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
      const stats = await handle.stat();
      if (!stats.isDirectory()) throw new ServiceError(400, "BAD_REQUEST", "请求路径不是目录");
      const operationPath = process.platform === "linux" ? `/proc/self/fd/${handle.fd}` : match.absolutePath;
      if (process.platform === "linux") {
        const openedPath = await realpath(operationPath);
        if (openedPath !== match.absolutePath || !isInside(match.realRoot, openedPath)) {
          throw new ServiceError(409, "BAD_REQUEST", "目录在操作前发生变化，请重试");
        }
      }
      return await operation({ ...match, operationPath });
    } finally { await handle.close(); }
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
      id: createHash("sha256").update(publicPath).digest("hex"),
      name: basename(publicPath),
      kind,
      path: publicPath,
      parentPath,
      sizeBytes: kind === "file" ? stats.size : null,
      modifiedAt: stats.mtime.toISOString(),
      owner: await this.owner(stats.uid),
    };
  }

  async list(value: string): Promise<FileListPayload> {
    return this.withStableDirectory(value, async (directory) => {
      const names = (await readdir(directory.operationPath)).filter((name) => name !== ".stackpilot-trash");
      if (names.length > 5000) throw new ServiceError(413, "PAYLOAD_TOO_LARGE", "目录项目超过 5000 个");
      const entries = await Promise.all(names.map((name) => this.entry(
        join(directory.operationPath, name),
        join(directory.absolutePath, name),
        directory.absolutePath,
      )));
      entries.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "directory" ? -1 : 1);
      return {
        rootPath: directory.configuredRoot,
        path: directory.absolutePath,
        parentPath: directory.absolutePath === directory.realRoot ? null : dirname(directory.absolutePath),
        entries,
        collectedAt: new Date().toISOString(),
        writable: await access(directory.operationPath, constants.W_OK).then(() => true, () => false),
      };
    });
  }

  async createDirectory(path: string, name: string): Promise<FileEntry> {
    return this.mutate(() => this.withStableDirectory(path, async (parent) => {
      const childName = validName(name);
      const operationPath = join(parent.operationPath, childName);
      const publicPath = join(parent.absolutePath, childName);
      try { await mkdir(operationPath, { mode: 0o775 }); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ServiceError(409, "BAD_REQUEST", "同名项目已存在");
        throw error;
      }
      const handle = await open(operationPath, constants.O_RDONLY | constants.O_DIRECTORY | (constants.O_NOFOLLOW ?? 0));
      try { await handle.chmod(0o775); }
      finally { await handle.close(); }
      return this.entry(operationPath, publicPath, parent.absolutePath);
    }));
  }

  async upload(path: string, name: string, content: Buffer): Promise<FileEntry> {
    return this.mutate(() => this.withStableDirectory(path, async (parent) => {
      const childName = validName(name);
      const operationPath = join(parent.operationPath, childName);
      const publicPath = join(parent.absolutePath, childName);
      let handle;
      try {
        handle = await open(
          operationPath,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
          0o664,
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ServiceError(409, "BAD_REQUEST", "同名项目已存在");
        throw error;
      }
      try {
        await handle.writeFile(content);
        await handle.chmod(0o664);
      } finally { await handle.close(); }
      return this.entry(operationPath, publicPath, parent.absolutePath);
    }));
  }

  async rename(path: string, newName: string): Promise<FileEntry> {
    return this.mutate(() => this.withStableDirectory(dirname(this.normalized(path)), async (parent) => {
      const sourceName = basename(path);
      const source = await this.stableChild(parent, sourceName);
      if (source.absolutePath === source.realRoot) throw new ServiceError(403, "FORBIDDEN", "不能重命名文件根目录");
      const targetName = validName(newName);
      const targetOperationPath = join(parent.operationPath, targetName);
      try { await lstat(targetOperationPath); throw new ServiceError(409, "BAD_REQUEST", "同名项目已存在"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      await rename(join(parent.operationPath, sourceName), targetOperationPath);
      return this.entry(targetOperationPath, join(parent.absolutePath, targetName), parent.absolutePath);
    }));
  }

  async moveToTrash(path: string): Promise<string> {
    return this.mutate(() => this.withStableDirectory(dirname(this.normalized(path)), async (parent) => {
      const sourceName = basename(path);
      const source = await this.stableChild(parent, sourceName);
      if (source.absolutePath === source.realRoot) throw new ServiceError(403, "FORBIDDEN", "不能删除文件根目录");
      return this.withStableDirectory(source.realRoot, async (root) => {
        const trashPath = join(root.absolutePath, ".stackpilot-trash");
        const trashOperationPath = join(root.operationPath, ".stackpilot-trash");
        try {
          const stats = await lstat(trashOperationPath);
          if (!stats.isDirectory() || stats.isSymbolicLink()) throw new ServiceError(403, "FORBIDDEN", "文件回收目录不安全");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          await mkdir(trashOperationPath, { mode: 0o700 });
        }
        const trashMatch = { configuredRoot: root.configuredRoot, realRoot: root.realRoot, absolutePath: trashPath };
        return this.withOpenedDirectory(trashMatch, trashOperationPath, async (trash) => {
          const bucketName = randomUUID();
          const bucket = join(trash.operationPath, bucketName);
          await mkdir(bucket, { mode: 0o700 });
          try { await rename(join(parent.operationPath, sourceName), join(bucket, sourceName)); }
          catch (error) { await rm(bucket, { recursive: true, force: true }); throw error; }
          return sourceName;
        });
      });
    }));
  }
}
