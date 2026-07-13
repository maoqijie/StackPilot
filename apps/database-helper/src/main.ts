import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseCollector } from "./collection/collector.js";
import { LocalDatabaseQueryClient } from "./collection/queryClient.js";
import { loadHelperConfig } from "./config.js";
import { DatabaseBackupService } from "./operations/backup.js";
import { DatabaseOperationService } from "./operations/operationService.js";
import { DatabaseProvisioner } from "./operations/provisioner.js";
import { DatabaseRestoreService } from "./operations/restore.js";
import { BackupScheduleStore } from "./operations/backupScheduler.js";
import { FixedCommandRunner } from "./platform/runner.js";
import { DatabaseHelperServer } from "./server.js";
import { OperationJournal } from "./state/operationJournal.js";
import { DatabaseRegistry } from "./state/registry.js";
import { assertRootHelper } from "./security/privilege.js";

export function createDatabaseHelper(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env) {
  assertRootHelper();
  const config = loadHelperConfig(env), registry = new DatabaseRegistry(config.stateDir), runner = new FixedCommandRunner();
  const schedules = new BackupScheduleStore(config.stateDir);
  const queries = new LocalDatabaseQueryClient(runner), collector = new DatabaseCollector(registry, queries, undefined, async () => {
    const active = new Set((await schedules.list()).map((plan) => plan.id)); return (await schedules.results()).filter((result) => active.has(result.planId));
  });
  const backups = new DatabaseBackupService(runner, queries), journal = new OperationJournal(join(config.stateDir, "operation-journal.json"));
  const provisioner = new DatabaseProvisioner(config.stateDir, registry, runner, queries);
  const restores = new DatabaseRestoreService(runner, queries, provisioner);
  return { config, journal, server: new DatabaseHelperServer(collector, new DatabaseOperationService(registry, queries, backups, journal, provisioner, restores)) };
}

const isMainModule = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  const { config, journal, server } = createDatabaseHelper(); await journal.recoverStale(); const socketServer = server.listen({
    path: config.socketPath, ...(config.socketFd === undefined ? {} : { fd: config.socketFd }), ...(config.socketGid === undefined ? {} : { gid: config.socketGid }),
  });
  const shutdown = () => socketServer.close(() => { process.exitCode = 0; }); process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown);
}
