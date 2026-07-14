import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DatabaseEngineSchema } from "@stackpilot/contracts";
import { loadHelperConfig } from "./config.js";
import { DatabaseIdentifierSchema, LocalIdSchema, ManagedInstanceSchema } from "./domain.js";
import { DatabaseRegistry } from "./state/registry.js";
import { BackupScheduleStore } from "./operations/backupScheduler.js";
import { BackupSchedulerInstaller } from "./operations/backupSchedulerInstaller.js";
import { acquireProcessLock } from "./operations/instanceLock.js";
import { readSupportedOs } from "./platform/osSupport.js";
import { FixedCommandRunner } from "./platform/runner.js";

const RegisterSchema = z.object({
  id: LocalIdSchema, name: LocalIdSchema, engine: DatabaseEngineSchema, version: z.string().max(80).nullable(),
  port: z.number().int().min(1).max(65_535), serviceName: z.string().min(1).max(120).regex(/^[A-Za-z0-9_.@:-]+$/),
  dataDirectory: z.string().min(1).max(512).regex(/^\/(?:[A-Za-z0-9_.@+-]+\/?)+$/),
  host: z.enum(["127.0.0.1", "::1"]).default("127.0.0.1"), username: DatabaseIdentifierSchema,
  password: z.string().min(16).max(512), initialDatabase: DatabaseIdentifierSchema,
  historicalSlowQueriesAvailable: z.boolean().default(false), managed: z.literal(false).default(false),
}).strict();

async function readStdin(limit = 16 * 1024) {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of process.stdin) { const value = Buffer.from(chunk); size += value.length; if (size > limit) throw new Error("注册请求过大"); chunks.push(value); }
  return Buffer.concat(chunks).toString("utf8");
}

export async function runCli(argv = process.argv.slice(2), env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env) {
  if (typeof process.getuid === "function" && process.getuid() !== 0) throw new Error("数据库注册 CLI 必须以 root 运行");
  const config = loadHelperConfig(env), schedules = new BackupScheduleStore(config.stateDir);
  if (argv[0] === "backup-plan" && argv[1] === "install-scheduler" && argv.length === 2) { const installed = await new BackupSchedulerInstaller(new FixedCommandRunner()).install(await readSupportedOs()); process.stdout.write(`${JSON.stringify({ installed })}\n`); return; }
  if (argv[0] === "backup-plan" && argv[1] === "results" && argv.length === 2) { process.stdout.write(`${JSON.stringify({ results: await schedules.results() })}\n`); return; }
  if (argv[0] === "backup-plan" && argv[1] === "replace" && argv.length === 2) { const release=await acquireProcessLock(config.stateDir,".backup-scheduler.lock");let plans;try{plans=await schedules.replace(JSON.parse(await readStdin(512 * 1024)));}finally{await release();}process.stdout.write(`${JSON.stringify({ plans })}\n`); return; }
  if (argv[0] === "backup-plan" && argv[1] === "remove" && argv.length === 3) { const release=await acquireProcessLock(config.stateDir,".backup-scheduler.lock");try{await schedules.remove(argv[2]!);}finally{await release();}process.stdout.write(`${JSON.stringify({ removed: argv[2] })}\n`); return; }
  if (argv[0] === "backup-plan" && argv[1] === "sync" && argv.length === 2) { const release=await acquireProcessLock(config.stateDir,".backup-scheduler.lock");let plan;try{plan=await schedules.sync(JSON.parse(await readStdin()));}finally{await release();}process.stdout.write(`${JSON.stringify({ plan })}\n`); return; }
  if (argv.length !== 1 || argv[0] !== "register") throw new Error("Usage: stackpilot-database-helper-cli register|backup-plan install-scheduler|replace|sync|remove <uuid>|results");
  const input = RegisterSchema.parse(JSON.parse(await readStdin()));
  const { password, ...registration } = input;
  const instance = ManagedInstanceSchema.parse({ ...registration, backupDirectory: resolve(config.stateDir, "backups", input.id), createdAt: new Date().toISOString() });
  await new DatabaseRegistry(config.stateDir).save(instance, { instanceId: input.id, username: input.username, password });
  process.stdout.write(`${JSON.stringify({ registered: input.id })}\n`);
}

const isMainModule = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) runCli().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "数据库注册失败"}\n`); process.exitCode = 1; });
