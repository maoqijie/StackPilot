import { constants } from "node:fs";
import { link, lstat, mkdir, open, readFile, readlink, readdir, realpath, rm, symlink } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { TrashFileEntry } from "@stackpilot/contracts";
import { ServiceError } from "../serviceError.js";

type RestoreConflict = ServiceError & { cleanRestoreConflict?: boolean };
type RestoreDirectory = { absolutePath: string; operationPath: string; realRoot: string };
const markerName = (id: string) => `.stackpilot-restore-${id}`;

function conflict(message: string): RestoreConflict {
  const error = new ServiceError(409, "BAD_REQUEST", message) as RestoreConflict;
  error.cleanRestoreConflict = true;
  return error;
}

function isWithin(root: string, candidate: string) {
  const value = relative(root, candidate);
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`));
}

async function assertStable(directory: RestoreDirectory) {
  if (process.platform !== "linux") return;
  let current: string;
  try { current = await realpath(directory.operationPath); }
  catch { throw conflict("恢复目录在操作期间发生变化"); }
  if (current !== directory.absolutePath || !isWithin(directory.realRoot, current)) throw conflict("恢复目录在操作期间发生变化");
}

async function withOpenedDirectory<T>(path: string, absolutePath: string, realRoot: string, operation: (directory: RestoreDirectory) => Promise<T>) {
  const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | (constants.O_NOFOLLOW ?? 0));
  try {
    const directory = { absolutePath, realRoot, operationPath: process.platform === "linux" ? `/proc/self/fd/${handle.fd}` : path };
    await assertStable(directory);
    const result = await operation(directory); await handle.sync(); return result;
  } finally { await handle.close(); }
}

async function sameFile(source: string, target: string) {
  const [left, right] = await Promise.all([lstat(source), lstat(target)]);
  return left.dev === right.dev && left.ino === right.ino;
}

async function copyTree(source: string, target: RestoreDirectory, marker: string): Promise<void> {
  const sourceNames = await readdir(source);
  for (const name of sourceNames) {
    await assertStable(target);
    const sourceChild = join(source, name); const targetChild = join(target.operationPath, name); const absoluteChild = join(target.absolutePath, name); const info = await lstat(sourceChild);
    try {
      if (info.isDirectory()) {
        await mkdir(targetChild, { mode: info.mode & 0o777 });
        await withOpenedDirectory(targetChild, absoluteChild, target.realRoot, (child) => copyTree(sourceChild, child, marker));
      } else if (info.isSymbolicLink()) await symlink(await readlink(sourceChild), targetChild);
      else if (info.isFile()) await link(sourceChild, targetChild);
      else throw conflict("目录包含不支持恢复的文件类型");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const targetInfo = await lstat(targetChild);
      if (info.isDirectory() && targetInfo.isDirectory()) await withOpenedDirectory(targetChild, absoluteChild, target.realRoot, (child) => copyTree(sourceChild, child, marker));
      else if (info.isSymbolicLink() && targetInfo.isSymbolicLink() && await readlink(sourceChild) === await readlink(targetChild)) continue;
      else if (info.isFile() && targetInfo.isFile() && await sameFile(sourceChild, targetChild)) continue;
      else throw conflict("恢复目标已被其他进程占用");
    }
    await assertStable(target);
  }
  const allowed = new Set([...sourceNames, marker]);
  if ((await readdir(target.operationPath)).some((name) => !allowed.has(name))) throw conflict("恢复目标已被其他进程修改");
}

async function restoreDirectory(source: string, targetPath: string, absoluteTarget: string, realRoot: string, id: string, allowExisting: boolean) {
  if (process.platform !== "linux") throw conflict("当前平台不支持安全恢复目录");
  const marker = markerName(id); let created = false;
  try { await mkdir(targetPath, { mode: 0o750 }); created = true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (!allowExisting) throw conflict("恢复目标已存在");
    const markerPath = join(targetPath, marker);
    try { if (!(await lstat(markerPath)).isFile() || await readFile(markerPath, "utf8") !== id) throw error; }
    catch { throw conflict("恢复目标已存在"); }
  }
  try {
    await withOpenedDirectory(targetPath, absoluteTarget, realRoot, async (target) => {
      const markerPath = join(target.operationPath, marker);
      if (created) { const handle = await open(markerPath, "wx", 0o600); try { await handle.writeFile(id); await handle.sync(); } finally { await handle.close(); } }
      await copyTree(source, target, marker); await assertStable(target);
    });
  } catch (error) {
    if (["ELOOP", "ENOTDIR", "ENOENT"].includes((error as NodeJS.ErrnoException).code ?? "")) throw conflict("恢复目录在操作期间发生变化");
    throw error;
  }
}

async function markerMatches(target: RestoreDirectory, id: string) {
  try {
    const marker = join(target.operationPath, markerName(id));
    return (await lstat(marker)).isFile() && await readFile(marker, "utf8") === id;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export function isCleanRestoreConflict(error: unknown) { return (error as RestoreConflict).cleanRestoreConflict === true; }
export function restoreMarker(target: string, id: string) { return join(target, markerName(id)); }

export async function restoreWithoutOverwrite(source: string, target: string, row: Pick<TrashFileEntry, "id" | "kind">, boundary: { absoluteTarget: string; realRoot: string }, allowExisting = false) {
  if (row.kind === "file") {
    try { await link(source, target); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        if (allowExisting && await sameFile(source, target)) return;
        throw conflict("恢复目标已存在");
      }
      throw error;
    }
    return;
  }
  await restoreDirectory(source, target, boundary.absoluteTarget, boundary.realRoot, row.id, allowExisting);
}

export async function finalizeRestore(source: string, target: string, row: Pick<TrashFileEntry, "id" | "kind">, boundary: { absoluteTarget: string; realRoot: string }) {
  if (row.kind === "file") {
    const sourceInfo = await lstat(source).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
    if (!sourceInfo) return;
    const targetInfo = await lstat(target).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
    if (!targetInfo || sourceInfo.dev !== targetInfo.dev || sourceInfo.ino !== targetInfo.ino) throw conflict("恢复目标在提交期间发生变化");
    await rm(source); return;
  }
  await withOpenedDirectory(target, boundary.absoluteTarget, boundary.realRoot, async (directory) => {
    if (!await markerMatches(directory, row.id)) throw conflict("恢复目标在提交期间发生变化");
    await rm(source, { recursive: true });
    await rm(join(directory.operationPath, markerName(row.id)), { force: true });
  });
}

export async function cleanupRestoreMarker(target: string, row: Pick<TrashFileEntry, "id" | "kind">, boundary: { absoluteTarget: string; realRoot: string }) {
  if (row.kind !== "directory") return;
  try {
    await withOpenedDirectory(target, boundary.absoluteTarget, boundary.realRoot, async (directory) => {
      if (await markerMatches(directory, row.id)) await rm(join(directory.operationPath, markerName(row.id)), { force: true });
    });
  } catch (error) {
    if (["ELOOP", "ENOTDIR", "ENOENT"].includes((error as NodeJS.ErrnoException).code ?? "") || isCleanRestoreConflict(error)) return;
    throw error;
  }
}
