import { EmptyObjectSchema, TrashMutationResponseSchema, TrashPayloadSchema } from "@stackpilot/contracts";
import type { RequestContext } from "./types.js";
import { ApiError, badRequest, notFound } from "./errors/ApiError.js";
import { sendJson } from "./response/json.js";
import { parseSchema } from "./validation.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function service(context: RequestContext) { if (!context.services.fileTrash) throw new ApiError(503, "NOT_READY", "文件回收站服务未配置"); return context.services.fileTrash; }
function idAt(context: RequestContext) { let value: string; try { value = decodeURIComponent(context.parts[3] ?? ""); } catch { throw badRequest("回收站项目 ID 编码无效"); } if (!UUID.test(value)) throw badRequest("回收站项目 ID 无效"); return value; }

export async function routeFileTrashRequest(context: RequestContext) {
  const method = context.request.method ?? "GET", trash = service(context);
  if (context.url.searchParams.size) throw badRequest("查询参数无效");
  if (context.parts.length === 3 && method === "GET") {
    context.identity?.require(context.principal, "files:read");
    sendJson(context.response, 200, await trash.list(), TrashPayloadSchema); return;
  }
  context.identity?.require(context.principal, "files:manage");
  parseSchema(EmptyObjectSchema, context.body, "请求体");
  const actor = context.principal?.user.displayName ?? context.principal?.userId ?? "unknown";
  if (context.parts.length === 5 && context.parts[4] === "restore" && method === "POST") {
    sendJson(context.response, 200, await trash.restore(idAt(context), actor), TrashMutationResponseSchema); return;
  }
  if (context.parts.length === 4 && context.parts[3] === "purge" && method === "DELETE") {
    context.identity?.consumeReauth(context.principal!, typeof context.request.headers["x-reauth-proof"] === "string" ? context.request.headers["x-reauth-proof"] : undefined);
    sendJson(context.response, 200, await trash.purgeAll(), TrashMutationResponseSchema); return;
  }
  if (context.parts.length === 4 && method === "DELETE") {
    context.identity?.consumeReauth(context.principal!, typeof context.request.headers["x-reauth-proof"] === "string" ? context.request.headers["x-reauth-proof"] : undefined);
    sendJson(context.response, 200, await trash.purge(idAt(context)), TrashMutationResponseSchema); return;
  }
  throw notFound("文件回收站接口不存在");
}
