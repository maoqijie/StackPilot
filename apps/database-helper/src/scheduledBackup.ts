import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalDatabaseQueryClient } from "./collection/queryClient.js";
import { loadHelperConfig } from "./config.js";
import { DatabaseBackupService } from "./operations/backup.js";
import { BackupScheduleStore, ScheduledBackupExecutor } from "./operations/backupScheduler.js";
import { FixedCommandRunner } from "./platform/runner.js";
import { assertRootHelper } from "./security/privilege.js";
import { DatabaseRegistry } from "./state/registry.js";
import { cleanupExpiredRollbackCopies } from "./operations/restore.js";

export async function runScheduledBackups(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env) {
  assertRootHelper(); const config = loadHelperConfig(env), registry = new DatabaseRegistry(config.stateDir), runner = new FixedCommandRunner();
  const backups = new DatabaseBackupService(runner, new LocalDatabaseQueryClient(runner));
  await cleanupExpiredRollbackCopies(await registry.list());
  return new ScheduledBackupExecutor(new BackupScheduleStore(config.stateDir), registry, backups).runDue();
}
const isMainModule = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) await runScheduledBackups().catch(() => { process.exitCode = 1; });
