import { createHash, timingSafeEqual } from "node:crypto";

export const DEFAULT_ALLOWED_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
];

export const DEFAULT_JSON_BODY_LIMIT_BYTES = 64 * 1024;
const parsedJsonBodies = new WeakMap();

export class HttpError extends Error {
  constructor(statusCode, message, options = {}) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.expose = options.expose ?? statusCode < 500;
    this.headers = options.headers;
  }
}

function parseAllowedOrigins(value) {
  const entries = value === undefined
    ? DEFAULT_ALLOWED_ORIGINS
    : String(value).split(",").map((item) => item.trim()).filter(Boolean);

  return entries.map((entry) => {
    if (entry === "*") throw new Error("STACKPILOT_ALLOWED_ORIGINS 不允许使用通配符");

    let url;
    try {
      url = new URL(entry);
    } catch {
      throw new Error("STACKPILOT_ALLOWED_ORIGINS 包含无效来源");
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== entry) {
      throw new Error("STACKPILOT_ALLOWED_ORIGINS 必须是完整的 HTTP(S) 来源且不能包含路径");
    }
    return url.origin;
  });
}

function parseBodyLimit(value) {
  if (value === undefined || value === "") return DEFAULT_JSON_BODY_LIMIT_BYTES;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("STACKPILOT_JSON_BODY_LIMIT_BYTES 必须是正整数");
  }
  return parsed;
}

export function loadSecurityConfig(env = process.env) {
  return {
    apiToken: env.STACKPILOT_API_TOKEN || null,
    allowedOrigins: parseAllowedOrigins(env.STACKPILOT_ALLOWED_ORIGINS),
    crontabWriteEnabled: env.STACKPILOT_ENABLE_CRONTAB_WRITE === "1",
    jsonBodyLimitBytes: parseBodyLimit(env.STACKPILOT_JSON_BODY_LIMIT_BYTES),
  };
}

function appendVary(response, value) {
  const current = response.getHeader("Vary");
  const values = new Set(String(current ?? "").split(",").map((item) => item.trim()).filter(Boolean));
  values.add(value);
  response.setHeader("Vary", [...values].join(", "));
}

export function applyCors(request, response, allowedOrigins) {
  const origin = request.headers.origin;
  if (!origin) return;

  appendVary(response, "Origin");
  if (!allowedOrigins.includes(origin)) {
    throw new HttpError(403, "请求来源不在允许列表中");
  }

  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Max-Age", "600");
}

function tokenDigest(value) {
  return createHash("sha256").update(value, "utf8").digest();
}

export function authenticateWriteRequest(request, configuredToken) {
  if (!configuredToken) {
    throw new HttpError(503, "写操作认证未配置", { expose: true });
  }

  const authorization = request.headers.authorization;
  const match = typeof authorization === "string" ? authorization.match(/^Bearer ([^\s]+)$/) : null;
  const suppliedToken = match?.[1] ?? "";
  const valid = timingSafeEqual(tokenDigest(suppliedToken), tokenDigest(configuredToken));
  if (!match || !valid) {
    throw new HttpError(401, "需要有效的 Bearer Token", {
      headers: { "WWW-Authenticate": "Bearer" },
    });
  }
}

export function assertCrontabWriteAllowed(enabled) {
  if (enabled) return;
  throw new HttpError(403, "crontab 写入与立即执行能力未开启");
}

export async function readJsonBody(request, limitBytes) {
  if (parsedJsonBodies.has(request)) return parsedJsonBodies.get(request);

  const contentLength = Number(request.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > limitBytes) {
    request.resume();
    throw new HttpError(413, "JSON 请求体过大");
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limitBytes) {
      request.resume();
      throw new HttpError(413, "JSON 请求体过大");
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks, size).toString("utf8");
  if (!raw.trim()) {
    parsedJsonBodies.set(request, {});
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    parsedJsonBodies.set(request, parsed);
    return parsed;
  } catch {
    throw new HttpError(400, "请求体必须是合法 JSON");
  }
}
