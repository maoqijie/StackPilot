import { DEFAULT_ALLOWED_ORIGINS, DEFAULT_CONTROLLER_HOST, DEFAULT_CONTROLLER_PORT, DEFAULT_WEB_PORT } from "@stackpilot/config";
import { z } from "zod";
import { readFileSync } from "node:fs";

const originListSchema = z.preprocess(
  (value) => value === undefined ? DEFAULT_ALLOWED_ORIGINS.join(",") : value,
  z.string().transform((value, context) => {
  const entries = value.split(",").map((item) => item.trim()).filter(Boolean);
  const origins: string[] = [];
  for (const entry of entries) {
    if (entry === "*") {
      context.addIssue({ code: "custom", message: "STACKPILOT_ALLOWED_ORIGINS 不允许使用通配符" });
      return z.NEVER;
    }
    try {
      const url = new URL(entry);
      if (!["http:", "https:"].includes(url.protocol) || url.origin !== entry) throw new Error();
      origins.push(url.origin);
    } catch {
      context.addIssue({ code: "custom", message: "STACKPILOT_ALLOWED_ORIGINS 必须是完整的 HTTP(S) 来源且不能包含路径" });
      return z.NEVER;
    }
  }
  return origins;
  }),
);

const environmentSchema = z.object({
  HOST: z.string().min(1).default(DEFAULT_CONTROLLER_HOST),
  PORT: z.coerce.number().int().min(1).max(65535).default(DEFAULT_CONTROLLER_PORT),
  STACKPILOT_WEB_PORT: z.coerce.number().int().min(1).max(65535).default(DEFAULT_WEB_PORT),
  STACKPILOT_DATABASE_PATH: z.string().min(1).default(".stackpilot/stackpilot.sqlite3"),
  STACKPILOT_MASTER_KEY: z.string().min(1).optional(),
  STACKPILOT_MASTER_KEY_FILE: z.string().min(1).optional(),
  STACKPILOT_COOKIE_SECURE: z.enum(["0", "1"]).default("1"),
  STACKPILOT_SESSION_SECONDS: z.coerce.number().int().min(300).max(30 * 24 * 60 * 60).default(12 * 60 * 60),
  STACKPILOT_ALLOWED_ORIGINS: originListSchema,
  STACKPILOT_ENABLE_CRONTAB_WRITE: z.enum(["0", "1"]).default("0"),
  STACKPILOT_JSON_BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(64 * 1024),
  STACKPILOT_UPLOAD_ROOT: z.string().min(1).default(".stackpilot/uploads"),
  STACKPILOT_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1024 * 1024 * 1024),
  STACKPILOT_UPLOAD_CHUNK_MAX_BYTES: z.coerce.number().int().positive().max(64 * 1024 * 1024).default(8 * 1024 * 1024),
  STACKPILOT_BACKUP_DIRS: z.string().optional(),
  STACKPILOT_NGINX_CONFIG_DIRS: z.string().optional(),
  STACKPILOT_NODE_RESTART_COMMAND: z.string().optional(),
  STACKPILOT_AGENT_PORT: z.coerce.number().int().min(1).max(65535).default(9443),
  STACKPILOT_AGENT_HOST: z.string().min(1).default(DEFAULT_CONTROLLER_HOST),
  STACKPILOT_AGENT_TLS_CERT_PATH: z.string().optional(),
  STACKPILOT_AGENT_TLS_KEY_PATH: z.string().optional(),
  STACKPILOT_AGENT_STATE_PATH: z.string().default(".stackpilot/controller-agent-state.json"),
  STACKPILOT_TRUSTED_PROXIES: z.string().default(""),
  STACKPILOT_PRODUCTION: z.enum(["0", "1"]).default("0"),
}).passthrough();

export type ControllerConfig = {
  host: string;
  port: number;
  webPort: number;
  databasePath: string;
  masterKey: string | null;
  cookieSecure: boolean;
  sessionSeconds: number;
  allowedOrigins: string[];
  crontabWriteEnabled: boolean;
  jsonBodyLimitBytes: number;
  uploadRoot: string;
  uploadMaxBytes: number;
  uploadChunkMaxBytes: number;
  backupDirs?: string;
  nginxConfigDirs: string[];
  restartCommand?: string;
  agentPort: number;
  agentHost: string;
  agentTlsCertPath?: string;
  agentTlsKeyPath?: string;
  agentStatePath: string;
  trustedProxies: string[];
  production: boolean;
};

export function loadControllerConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): ControllerConfig {
  const parsed = environmentSchema.parse(env);
  if(parsed.STACKPILOT_MASTER_KEY&&parsed.STACKPILOT_MASTER_KEY_FILE)throw new Error("STACKPILOT_MASTER_KEY 与 STACKPILOT_MASTER_KEY_FILE 不能同时配置");
  if (Boolean(parsed.STACKPILOT_AGENT_TLS_CERT_PATH) !== Boolean(parsed.STACKPILOT_AGENT_TLS_KEY_PATH)) throw new Error("Agent TLS certificate and key must be configured together");
  const trustedProxies=parsed.STACKPILOT_TRUSTED_PROXIES.split(",").map((value)=>value.trim()).filter(Boolean);
  for(const entry of trustedProxies)if(!/^(?:\d{1,3}\.){3}\d{1,3}(?:\/(?:[0-9]|[12][0-9]|3[0-2]))?$/.test(entry)&&!/^[:0-9a-f]+(?:\/(?:\d|[1-9]\d|1[01]\d|12[0-8]))?$/i.test(entry))throw new Error("STACKPILOT_TRUSTED_PROXIES 必须是 IP 或 CIDR");
  if(parsed.STACKPILOT_PRODUCTION==="1"&&parsed.STACKPILOT_COOKIE_SECURE!=="1")throw new Error("生产模式必须使用 Secure Cookie");
  return {
    host: parsed.HOST,
    port: parsed.PORT,
    webPort: parsed.STACKPILOT_WEB_PORT,
    databasePath: parsed.STACKPILOT_DATABASE_PATH,
    masterKey: parsed.STACKPILOT_MASTER_KEY ?? (parsed.STACKPILOT_MASTER_KEY_FILE?readFileSync(parsed.STACKPILOT_MASTER_KEY_FILE,"utf8").trim():null),
    cookieSecure: parsed.STACKPILOT_COOKIE_SECURE === "1",
    sessionSeconds: parsed.STACKPILOT_SESSION_SECONDS,
    allowedOrigins: parsed.STACKPILOT_ALLOWED_ORIGINS,
    crontabWriteEnabled: parsed.STACKPILOT_ENABLE_CRONTAB_WRITE === "1",
    jsonBodyLimitBytes: parsed.STACKPILOT_JSON_BODY_LIMIT_BYTES,
    uploadRoot: parsed.STACKPILOT_UPLOAD_ROOT,
    uploadMaxBytes: parsed.STACKPILOT_UPLOAD_MAX_BYTES,
    uploadChunkMaxBytes: parsed.STACKPILOT_UPLOAD_CHUNK_MAX_BYTES,
    ...(parsed.STACKPILOT_BACKUP_DIRS ? { backupDirs: parsed.STACKPILOT_BACKUP_DIRS } : {}),
    nginxConfigDirs: (parsed.STACKPILOT_NGINX_CONFIG_DIRS ?? "/etc/nginx/conf.d,/etc/nginx/sites-enabled").split(",").map((value) => value.trim()).filter(Boolean),
    ...(parsed.STACKPILOT_NODE_RESTART_COMMAND ? { restartCommand: parsed.STACKPILOT_NODE_RESTART_COMMAND } : {}),
    agentPort: parsed.STACKPILOT_AGENT_PORT,
    agentHost: parsed.STACKPILOT_AGENT_HOST,
    ...(parsed.STACKPILOT_AGENT_TLS_CERT_PATH ? { agentTlsCertPath: parsed.STACKPILOT_AGENT_TLS_CERT_PATH } : {}),
    ...(parsed.STACKPILOT_AGENT_TLS_KEY_PATH ? { agentTlsKeyPath: parsed.STACKPILOT_AGENT_TLS_KEY_PATH } : {}),
    agentStatePath: parsed.STACKPILOT_AGENT_STATE_PATH,
    trustedProxies,
    production:parsed.STACKPILOT_PRODUCTION==="1",
  };
}
