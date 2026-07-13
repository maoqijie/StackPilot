import { link, lstat, mkdir, open, readlink, readdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import type { TrashFileEntry } from "@stackpilot/contracts";
import { ServiceError } from "../serviceError.js";

const markerName = (id: string) => `.stackpilot-restore-${id}`;
type RestoreConflict = ServiceError & { cleanRestoreConflict?: boolean };

function conflict(message: string): RestoreConflict {
  const error = new ServiceError(409, "BAD_REQUEST", message) as RestoreConflict;
  error.cleanRestoreConflict = true;
  return error;
}

export function isCleanRestoreConflict(error: unknown) {
  return (error as RestoreConflict).cleanRestoreConflict === true;
}

export function restoreMarker(target: string, id: string) { return join(target, markerName(id)); }

async function sameFile(source: string, target: string) {
  const [left, right] = await Promise.all([lstat(source), lstat(target)]);
  return left.dev === right.dev && left.ino === right.ino;
}

async function copyTree(source: string, target: string, marker: string): Promise<void> {
  const sourceNames = await readdir(source);
  for (const name of sourceNames) {
    const sourceChild = join(source, name); const targetChild = join(target, name); const info = await lstat(sourceChild);
    try {
      if (info.isDirectory()) { await mkdir(targetChild, { mode: info.mode & 0o777 }); await copyTree(sourceChild, targetChild, marker); }
      else if (info.isSymbolicLink()) await symlink(await readlink(sourceChild), targetChild);
      else if (info.isFile()) await link(sourceChild, targetChild);
      else throw conflict("目录包含不支持恢复的文件类型");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const targetInfo = await lstat(targetChild);
      if (info.isDirectory() && targetInfo.isDirectory()) await copyTree(sourceChild, targetChild, marker);
      else if (info.isSymbolicLink() && targetInfo.isSymbolicLink() && await readlink(sourceChild) === await readlink(targetChild)) continue;
      else if (info.isFile() && targetInfo.isFile() && await sameFile(sourceChild, targetChild)) continue;
      else throw conflict("恢复目标已被其他进程占用");
    }
  }
  const allowed = new Set([...sourceNames, marker]);
  if ((await readdir(target)).some((name) => !allowed.has(name))) throw conflict("恢复目标已被其他进程修改");
}

async function restoreDirectory(source: string, target: string, id: string, recovering: boolean) {
  const marker = markerName(id); const markerPath = join(target, marker);
  try { await mkdir(target, { mode: 0o750 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    try { if (!recovering || !(await lstat(markerPath)).isFile()) throw error; }
    catch { throw conflict("恢复目标已存在"); }
  }
  try { await link(source, markerPath); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EPERM" && (error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      const handle = await open(markerPath, "wx", 0o600); await handle.close();
    }
  }
  await copyTree(source, target, marker);
  await rm(source, { recursive: true });
  await rm(markerPath, { force: true });
}

export async function restoreWithoutOverwrite(source: string, target: string, row: Pick<TrashFileEntry, "id" | "kind">, recovering = false) {
  if (row.kind === "file") {
    try { await link(source, target); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        if (recovering && await sameFile(source, target)) { await rm(source); return; }
        throw conflict("恢复目标已存在");
      }
      throw error;
    }
    await rm(source);
    return;
  }
  await restoreDirectory(source, target, row.id, recovering);
}
