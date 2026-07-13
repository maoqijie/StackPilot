import {
  CreateDatabaseBackupRequestSchema,
  DatabaseBackupMutationResponseSchema,
  DatabaseBackupsPayloadSchema,
  EmptyObjectSchema,
  PathIdSchema,
} from "@stackpilot/contracts";
import type { RequestContext } from "./types.js";
import { badRequest, notFound } from "./errors/ApiError.js";
import { sendJson } from "./response/json.js";
import { parseSchema } from "./validation.js";

function backupId(context: RequestContext) {
  try {
    return parseSchema(PathIdSchema, decodeURIComponent(context.parts[3] ?? ""), "备份 ID");
  } catch (error) {
    if (error instanceof URIError) throw badRequest("备份 ID 编码无效");
    throw error;
  }
}

function requireBackupWrite(context: RequestContext) {
  context.identity?.require(context.principal, "system:backup");
  context.identity?.consumeReauth(
    context.principal!,
    typeof context.request.headers["x-reauth-proof"] === "string" ? context.request.headers["x-reauth-proof"] : undefined,
  );
}

export async function routeDatabaseBackupRequest(context: RequestContext) {
  const method = context.request.method ?? "GET";
  const { parts, response, services } = context;
  context.identity?.require(context.principal, "system:backup");

  if (parts.length === 2 && method === "GET") {
    sendJson(response, 200, await services.databaseBackups.snapshot(), DatabaseBackupsPayloadSchema);
    return;
  }
  if (parts.length === 2 && method === "POST") {
    requireBackupWrite(context);
    const input = parseSchema(CreateDatabaseBackupRequestSchema, context.body, "在线备份请求");
    const backup = await services.databaseBackups.create(input.idempotencyKey);
    sendJson(response, 201, { backup, message: "Controller 数据库在线备份完成", tone: "success" }, DatabaseBackupMutationResponseSchema);
    return;
  }
  if (parts.length === 4 && parts[2] === "verify" && method === "POST") {
    requireBackupWrite(context);
    parseSchema(EmptyObjectSchema, context.body, "请求体");
    const backup = await services.databaseBackups.verify(backupId(context));
    sendJson(response, 200, { backup, message: "备份完整性与校验和已验证", tone: "success" }, DatabaseBackupMutationResponseSchema);
    return;
  }
  if (parts.length === 4 && parts[2] === "drill" && method === "POST") {
    requireBackupWrite(context);
    parseSchema(EmptyObjectSchema, context.body, "请求体");
    const backup = await services.databaseBackups.drill(backupId(context));
    sendJson(response, 200, { backup, message: "隔离恢复演练通过，生产数据库未发生变更", tone: "success" }, DatabaseBackupMutationResponseSchema);
    return;
  }
  throw notFound("数据库备份接口不存在");
}
