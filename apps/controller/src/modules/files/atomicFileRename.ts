import { link, unlink } from "node:fs/promises";
import { ServiceError } from "../serviceError.js";

export async function atomicFileRename(
  sourcePath: string,
  targetPath: string,
  assertStable: () => Promise<void>,
): Promise<void> {
  await assertStable();
  try { await link(sourcePath, targetPath); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ServiceError(409, "BAD_REQUEST", "同名项目已存在");
    throw error;
  }
  try {
    await assertStable();
    await unlink(sourcePath);
    await assertStable();
  } catch (error) {
    try {
      await link(targetPath, sourcePath).catch((reason) => {
        if ((reason as NodeJS.ErrnoException).code !== "EEXIST") throw reason;
      });
      await unlink(targetPath);
    } catch { /* Preserve both names rather than risking data loss. */ }
    throw error;
  }
}
