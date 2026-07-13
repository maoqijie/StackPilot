import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { ServiceError } from "../serviceError.js";

export type StableDirectory = {
  absolutePath: string;
  operationPath: string;
  realRoot: string;
};

export type StableChild = {
  absolutePath: string;
  operationPath: string;
};

export function isWithin(root: string, candidate: string) {
  const value = relative(root, candidate);
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

export class FileStorageSafety {
  readonly root: string;

  constructor(root: string, repoRoot: string) {
    this.root = isAbsolute(root) ? normalize(root) : resolve(repoRoot, root);
  }

  virtualPath(absolute: string) {
    const value = relative(this.root, absolute).split(sep).join("/");
    return value ? `/${value}` : "/";
  }

  requestedPath(path: string) {
    if (!path.startsWith("/") || path.includes("\0")) {
      throw new ServiceError(400, "BAD_REQUEST", "路径必须是绝对虚拟路径");
    }
    const candidate = resolve(this.root, `.${path}`);
    if (!isWithin(this.root, candidate)) {
      throw new ServiceError(403, "FORBIDDEN", "路径超出受管文件根目录");
    }
    return candidate;
  }

  async withStableDirectory<T>(path: string, operation: (directory: StableDirectory) => Promise<T>): Promise<T> {
    const candidate = this.requestedPath(path);
    let realRoot: string;
    let realTarget: string;
    try {
      realRoot = await realpath(this.root);
      if ((await lstat(candidate)).isSymbolicLink()) throw new ServiceError(403, "FORBIDDEN", "不允许访问符号链接");
      realTarget = await realpath(candidate);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(404, "NOT_FOUND", "文件或目录不存在");
    }
    const expected = resolve(realRoot, relative(this.root, candidate));
    if (realTarget !== expected || !isWithin(realRoot, realTarget)) {
      throw new ServiceError(403, "FORBIDDEN", "路径包含符号链接或超出受管文件根目录");
    }
    const handle = await open(candidate, constants.O_RDONLY | constants.O_DIRECTORY | (constants.O_NOFOLLOW ?? 0));
    try {
      if (!(await handle.stat()).isDirectory()) throw new ServiceError(400, "BAD_REQUEST", "目标路径不是目录");
      const operationPath = process.platform === "linux" ? `/proc/self/fd/${handle.fd}` : candidate;
      if (process.platform === "linux") {
        const openedPath = await realpath(operationPath);
        if (openedPath !== realTarget || !isWithin(realRoot, openedPath)) {
          throw new ServiceError(409, "BAD_REQUEST", "目录在操作前发生变化，请重试");
        }
      }
      return await operation({ absolutePath: candidate, operationPath, realRoot });
    } finally {
      await handle.close();
    }
  }

  withStableParent<T>(path: string, operation: (parent: StableDirectory, target: StableChild) => Promise<T>) {
    const target = this.requestedPath(path);
    return this.withStableDirectory(this.virtualPath(dirname(target)), (parent) => operation(parent, {
      absolutePath: target,
      operationPath: join(parent.operationPath, basename(target)),
    }));
  }

  async stableChild(parent: StableDirectory, name: string): Promise<StableChild> {
    const operationPath = join(parent.operationPath, name);
    const absolutePath = join(parent.absolutePath, name);
    let resolved: string;
    try {
      if ((await lstat(operationPath)).isSymbolicLink()) throw new ServiceError(403, "FORBIDDEN", "不允许访问符号链接");
      resolved = await realpath(operationPath);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new ServiceError(404, "NOT_FOUND", "文件或目录不存在");
      throw error;
    }
    const expected = join(await realpath(parent.operationPath), name);
    if (resolved !== expected || !isWithin(parent.realRoot, resolved)) {
      throw new ServiceError(403, "FORBIDDEN", "路径包含符号链接或超出受管文件根目录");
    }
    return { absolutePath, operationPath };
  }
}
