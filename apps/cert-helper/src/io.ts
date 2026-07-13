import { chmod, lstat, mkdir, opendir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { HelperError } from "./types.js";

export function within(root: string, ...parts: string[]) {
  const base = resolve(root); const path = resolve(base, ...parts);
  if (path !== base && !path.startsWith(`${base}${sep}`)) throw new HelperError("INVALID_PATH", "Resolved path escaped its fixed root");
  return path;
}

export async function atomicWrite(path: string, content: string, mode = 0o600) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content, { encoding: "utf8", mode });
  await chmod(temporary, mode); await rename(temporary, path);
}

export async function readJson<T>(path: string): Promise<T | null> {
  try { return JSON.parse(await readFile(path, "utf8")) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

export async function immutableTree(root: string) {
  const info = await lstat(root); if (info.isSymbolicLink()) return;
  await chmod(root, info.isDirectory() || info.mode & 0o111 ? 0o555 : 0o444);
  if (!info.isDirectory()) return;
  const directory = await opendir(root);
  try { for await (const entry of directory) await immutableTree(within(root, entry.name)); } finally { await directory.close().catch(() => undefined); }
}

export async function removeIfExists(path: string) { await rm(path, { recursive: true, force: true }); }
