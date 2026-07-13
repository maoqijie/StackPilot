import {
  CreateFileUploadRequestSchema, EmptyObjectSchema, FileUploadChunkResponseSchema, FileUploadClearResponseSchema,
  FileUploadListResponseSchema, FileUploadMutationResponseSchema,
} from "@stackpilot/contracts";
import type { RequestContext } from "./types.js";
import { ApiError, notFound } from "./errors/ApiError.js";
import { sendJson } from "./response/json.js";
import { parseSchema } from "./validation.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function uploadId(context: RequestContext): string { const value = context.parts[2] ?? ""; if (!UUID.test(value)) throw new ApiError(400, "BAD_REQUEST", "上传任务 ID 无效"); return value; }
function service(context: RequestContext) { if (!context.services.files) throw new ApiError(503, "NOT_READY", "文件上传服务未配置"); return context.services.files; }
function integerHeader(context: RequestContext, name: "upload-offset" | "content-length"): number {
  const value = context.request.headers[name];
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) throw new ApiError(400, "BAD_REQUEST", `${name} 请求头无效`);
  const parsed = Number(value); if (!Number.isSafeInteger(parsed)) throw new ApiError(400, "BAD_REQUEST", `${name} 请求头无效`); return parsed;
}

export async function routeFileRequest(context: RequestContext): Promise<void> {
  const method = context.request.method ?? "GET";
  if (context.parts.length === 2 && method === "GET") {
    context.identity?.require(context.principal, "files:read");
    sendJson(context.response, 200, await service(context).list(), FileUploadListResponseSchema); return;
  }
  if (context.parts.length === 2 && method === "POST") {
    context.identity?.require(context.principal, "files:write");
    const input = parseSchema(CreateFileUploadRequestSchema, context.body, "上传任务");
    sendJson(context.response, 201, { upload: await service(context).create(context.principal!, input) }, FileUploadMutationResponseSchema); return;
  }
  if (context.parts[2] === "clear-completed" && context.parts.length === 3 && method === "POST") {
    context.identity?.require(context.principal, "files:write");
    sendJson(context.response, 200, { removed: service(context).clearCompleted() }, FileUploadClearResponseSchema); return;
  }
  if (context.parts[3] === "chunks" && context.parts.length === 4 && method === "POST") {
    context.identity?.require(context.principal, "files:write");
    if (context.request.headers["content-type"] !== "application/octet-stream") throw new ApiError(400, "BAD_REQUEST", "上传分片必须使用 application/octet-stream");
    let upload;
    try { upload = await service(context).append(uploadId(context), integerHeader(context, "upload-offset"), integerHeader(context, "content-length"), context.request); }
    catch (error) { context.request.resume(); throw error; }
    sendJson(context.response, 200, { upload, nextOffset: upload.receivedBytes }, FileUploadChunkResponseSchema); return;
  }
  if (context.parts[3] === "complete" && context.parts.length === 4 && method === "POST") {
    context.identity?.require(context.principal, "files:write");
    parseSchema(EmptyObjectSchema, context.body, "请求体");
    sendJson(context.response, 200, { upload: await service(context).complete(uploadId(context)) }, FileUploadMutationResponseSchema); return;
  }
  if (context.parts.length === 3 && method === "DELETE") {
    context.identity?.require(context.principal, "files:write");
    sendJson(context.response, 200, { upload: await service(context).cancel(uploadId(context)) }, FileUploadMutationResponseSchema); return;
  }
  throw notFound("文件上传接口不存在");
}
