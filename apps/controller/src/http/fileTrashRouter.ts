import { EmptyObjectSchema, PathIdSchema, TrashMutationResponseSchema, TrashPayloadSchema } from "@stackpilot/contracts";
import type { RequestContext } from "./types.js";
import { badRequest, notFound } from "./errors/ApiError.js";
import { sendJson } from "./response/json.js";
import { parseSchema } from "./validation.js";

function idAt(context: RequestContext) {
  try { return parseSchema(PathIdSchema, decodeURIComponent(context.parts[3] ?? ""), "回收站项目 ID"); }
  catch (error) { if (error instanceof URIError) throw badRequest("路径参数编码无效"); throw error; }
}

export async function routeFileTrashRequest(context: RequestContext) {
  const { method = "GET" } = context.request;
  const { parts, response, services } = context;
  if (parts.length === 3 && method === "GET") {
    context.identity?.require(context.principal, "files:read");
    sendJson(response, 200, services.fileTrash.list(), TrashPayloadSchema); return;
  }
  context.identity?.require(context.principal, "files:manage");
  parseSchema(EmptyObjectSchema, context.body, "请求体");
  const actor = context.principal?.user.username ?? context.principal?.userId ?? "unknown";
  if (parts.length === 5 && parts[4] === "restore" && method === "POST") {
    sendJson(response, 200, services.fileTrash.restore(idAt(context), actor), TrashMutationResponseSchema); return;
  }
  if (parts.length === 4 && parts[3] === "purge" && method === "DELETE") {
    sendJson(response, 200, services.fileTrash.purgeAll(), TrashMutationResponseSchema); return;
  }
  if (parts.length === 4 && method === "DELETE") {
    sendJson(response, 200, services.fileTrash.purge(idAt(context)), TrashMutationResponseSchema); return;
  }
  throw notFound("文件回收站接口不存在");
}
