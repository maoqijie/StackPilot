import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { HelperError } from "../domain.js";

const OwnerSchema = z.object({ pid: z.number().int().positive(), createdAt: z.string().datetime() }).strict();
function processAlive(pid: number) { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; } }
export async function acquireProcessLock(directory: string, name: string) {
  if (!/^\.[a-z-]+\.lock$/.test(name)) throw new HelperError("INVALID_LOCK_NAME", "本地操作锁名称无效");
  await mkdir(directory, { recursive: true, mode: 0o700 }); const path = join(directory, name);
  try { await mkdir(path, { mode: 0o700 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    let owner; try { owner = OwnerSchema.parse(JSON.parse(await readFile(join(path, "owner.json"), "utf8"))); } catch { owner = null; }
    if (owner && processAlive(owner.pid)) throw new HelperError("DATABASE_OPERATION_IN_PROGRESS", "实例已有备份或恢复操作正在执行");
    await rm(path, { recursive: true, force: true }); try { await mkdir(path, { mode: 0o700 }); } catch { throw new HelperError("DATABASE_OPERATION_IN_PROGRESS", "实例已有备份或恢复操作正在执行"); }
  }
  await writeFile(join(path, "owner.json"), JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }), { mode: 0o600 });
  let released = false; return async () => { if (released) return; released = true; await rm(path, { recursive: true, force: true }); };
}
export const acquireInstanceLock = (backupDirectory: string) => acquireProcessLock(backupDirectory, ".instance-operation.lock");
