import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DatabaseEngineSchema } from "@stackpilot/contracts";
import { loadHelperConfig } from "./config.js";
import { DatabaseIdentifierSchema, LocalIdSchema, ManagedInstanceSchema } from "./domain.js";
import { DatabaseRegistry } from "./state/registry.js";

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
  if (argv.length !== 1 || argv[0] !== "register") throw new Error("Usage: stackpilot-database-helper-cli register < registration.json");
  const config = loadHelperConfig(env), input = RegisterSchema.parse(JSON.parse(await readStdin()));
  const { password, ...registration } = input;
  const instance = ManagedInstanceSchema.parse({ ...registration, backupDirectory: resolve(config.stateDir, "backups", input.id), createdAt: new Date().toISOString() });
  await new DatabaseRegistry(config.stateDir).save(instance, { instanceId: input.id, username: input.username, password });
  process.stdout.write(`${JSON.stringify({ registered: input.id })}\n`);
}

const isMainModule = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) runCli().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "数据库注册失败"}\n`); process.exitCode = 1; });
