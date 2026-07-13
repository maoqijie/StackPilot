import {
  CreateDirectoryRequestSchema, EmptyTrashRequestSchema, FileListPayloadSchema, FileMutationResponseSchema, FileTrashPayloadSchema,
  FileUploadResponseSchema, FileUploadsPayloadSchema, RenameFileRequestSchema, TrashFileRequestSchema, TrashMutationRequestSchema,
  CreateFileUploadRequestSchema, EmptyObjectSchema, FileUploadChunkResponseSchema, FileUploadClearResponseSchema,
  FileUploadListResponseSchema, FileUploadMutationResponseSchema,
} from "@stackpilot/contracts";
import type { RequestContext } from "./types.js";
import { ApiError, badRequest, notFound } from "./errors/ApiError.js";
import { sendJson } from "./response/json.js";
import { parseSchema } from "./validation.js";
import { requestSource } from "./trustedProxy.js";

function decodedHeader(context: RequestContext, name: string) {
  const raw = context.request.headers[name]; if (typeof raw !== "string") throw badRequest(`缺少 ${name} 请求头`);
  try { return decodeURIComponent(raw); } catch { throw badRequest(`${name} 请求头编码无效`); }
}

function auditFile(context: RequestContext, action: string, targetId: string, parameters: unknown = {}) {
  if (!context.identity || !context.principal) return;
  context.identity.audit.append({
    actorType: context.principal.type, actorId: context.principal.userId,
    sessionId: context.principal.type === "session" ? context.principal.id : null,
    source: requestSource(context.request, context.config.trustedProxies), targetType: "managed-file", targetId, action, parameters,
    outcome: "success", authorization: "allowed", requestId: context.requestId,
  });
}

export async function routeFileRequest(context: RequestContext) {
  const { request, response, services, parts } = context; const method = request.method ?? "GET";
  if (context.url.pathname === "/api/files" && method === "GET") {
    context.identity?.require(context.principal, "files:read"); const path = context.url.searchParams.get("path") ?? "/";
    if ([...context.url.searchParams.keys()].some((key) => key !== "path")) throw badRequest("文件列表查询参数无效");
    sendJson(response, 200, await services.files.list(path), FileListPayloadSchema); return;
  }
  if (context.url.pathname === "/api/files/directories" && method === "POST") {
    context.identity?.require(context.principal, "files:write"); const input = parseSchema(CreateDirectoryRequestSchema, context.body, "创建目录");
    const entry = await services.files.createDirectory(input.parentPath, input.name); auditFile(context, "file.directory.create", entry.path); sendJson(response, 201, { message: `${input.name} 已创建`, entry }, FileMutationResponseSchema); return;
  }
  if (context.url.pathname === "/api/files/rename" && method === "PATCH") {
    context.identity?.require(context.principal, "files:write"); const input = parseSchema(RenameFileRequestSchema, context.body, "重命名文件");
    const entry = await services.files.rename(input.path, input.name); auditFile(context, "file.rename", entry.path, { previousPath: input.path }); sendJson(response, 200, { message: "文件项已重命名", entry }, FileMutationResponseSchema); return;
  }
  if (context.url.pathname === "/api/files/trash" && method === "POST") {
    context.identity?.require(context.principal, "files:write"); const input = parseSchema(TrashFileRequestSchema, context.body, "移入回收站");
    const trashEntry = await services.files.trash(input.path); auditFile(context, "file.trash", input.path, { trashId: trashEntry.id }); sendJson(response, 200, { message: "文件项已移入回收站", trashEntry }, FileMutationResponseSchema); return;
  }
  if (context.url.pathname === "/api/file-trash" && method === "GET") { context.identity?.require(context.principal, "files:read"); sendJson(response, 200, await services.files.listTrash(), FileTrashPayloadSchema); return; }
  if (context.url.pathname === "/api/file-trash/restore" && method === "POST") {
    context.identity?.require(context.principal, "files:write"); const { id } = parseSchema(TrashMutationRequestSchema, context.body, "恢复文件");
    const entry = await services.files.restore(id); auditFile(context, "file.restore", entry.path, { trashId: id }); sendJson(response, 200, { message: "文件已恢复", entry }, FileMutationResponseSchema); return;
  }
  if (context.url.pathname === "/api/file-trash" && method === "DELETE") {
    context.identity?.require(context.principal, "files:delete");
    const item = TrashMutationRequestSchema.safeParse(context.body); const empty = EmptyTrashRequestSchema.safeParse(context.body);
    if (!item.success && !empty.success) throw badRequest("永久删除请求必须指定有效文件 ID 或显式确认清空回收站");
    const proof = context.request.headers["x-reauth-proof"];
    context.identity?.consumeReauth(context.principal!, typeof proof === "string" ? proof : undefined);
    if (item.success) { await services.files.purge(item.data.id); auditFile(context, "file.purge", item.data.id); sendJson(response, 200, { message: "文件已永久删除" }, FileMutationResponseSchema); }
    else { const count = await services.files.emptyTrash(); auditFile(context, "file.trash.empty", "all", { count }); sendJson(response, 200, { message: `已永久删除 ${count} 个文件项` }, FileMutationResponseSchema); }
    return;
  }
  if (context.url.pathname === "/api/file-uploads" && method === "GET") { context.identity?.require(context.principal, "files:read"); sendJson(response, 200, await services.files.listUploads(), FileUploadsPayloadSchema); return; }
  if (context.url.pathname === "/api/file-uploads" && method === "POST") {
    context.identity?.require(context.principal, "files:write"); if (request.headers["content-type"] !== "application/octet-stream") throw badRequest("上传请求必须使用 application/octet-stream");
    const targetPath = decodedHeader(context, "x-file-target-path"); const name = decodedHeader(context, "x-file-name");
    const lengthHeader = context.request.headers["content-length"]; const contentLength = typeof lengthHeader === "string" ? Number(lengthHeader) : undefined;
    const result = await services.files.upload(targetPath, name, context.request, context.principal?.user.displayName ?? "unknown", Number.isFinite(contentLength) ? contentLength : undefined);
    auditFile(context, "file.upload", result.entry.path, { sizeBytes: result.upload.sizeBytes });
    sendJson(response, 201, { message: `${name} 上传完成`, ...result }, FileUploadResponseSchema); return;
  }
  if (["files", "file-trash", "file-uploads"].includes(parts[1] ?? "")) throw notFound("文件接口不存在");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function uploadId(context: RequestContext) { const value = context.parts[2] ?? ""; if (!UUID.test(value)) throw badRequest("上传任务 ID 无效"); return value; }
function uploadService(context: RequestContext) { if (!context.services.fileUploads) throw new ApiError(503, "NOT_READY", "文件上传服务未配置"); return context.services.fileUploads; }
function integerHeader(context: RequestContext, name: "upload-offset" | "content-length") { const value = context.request.headers[name]; if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) throw badRequest(`${name} 请求头无效`); const parsed = Number(value); if (!Number.isSafeInteger(parsed)) throw badRequest(`${name} 请求头无效`); return parsed; }

export async function routeFileUploadRequest(context: RequestContext) {
  const method = context.request.method ?? "GET"; const service = uploadService(context);
  if (context.parts.length === 2 && method === "GET") { context.identity?.require(context.principal, "files:read"); sendJson(context.response, 200, await service.list(), FileUploadListResponseSchema); return; }
  if (context.parts.length === 2 && method === "POST") { context.identity?.require(context.principal, "files:write"); const input = parseSchema(CreateFileUploadRequestSchema, context.body, "上传任务"); sendJson(context.response, 201, { upload: await service.create(context.principal!, input) }, FileUploadMutationResponseSchema); return; }
  if (context.parts[2] === "clear-completed" && context.parts.length === 3 && method === "POST") { context.identity?.require(context.principal, "files:write"); sendJson(context.response, 200, { removed: service.clearCompleted() }, FileUploadClearResponseSchema); return; }
  if (context.parts[3] === "chunks" && context.parts.length === 4 && method === "POST") { context.identity?.require(context.principal, "files:write"); if (context.request.headers["content-type"] !== "application/octet-stream") throw badRequest("上传分片必须使用 application/octet-stream"); let upload; try { upload = await service.append(uploadId(context), integerHeader(context, "upload-offset"), integerHeader(context, "content-length"), context.request); } catch (error) { context.request.resume(); throw error; } sendJson(context.response, 200, { upload, nextOffset: upload.receivedBytes }, FileUploadChunkResponseSchema); return; }
  if (context.parts[3] === "complete" && context.parts.length === 4 && method === "POST") { context.identity?.require(context.principal, "files:write"); parseSchema(EmptyObjectSchema, context.body, "请求体"); sendJson(context.response, 200, { upload: await service.complete(uploadId(context)) }, FileUploadMutationResponseSchema); return; }
  if (context.parts.length === 3 && method === "DELETE") { context.identity?.require(context.principal, "files:write"); sendJson(context.response, 200, { upload: await service.cancel(uploadId(context)) }, FileUploadMutationResponseSchema); return; }
  throw notFound("文件上传接口不存在");
}
