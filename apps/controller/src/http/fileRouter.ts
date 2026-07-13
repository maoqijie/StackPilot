import {
  CreateDirectoryRequestSchema, EmptyTrashRequestSchema, FileListPayloadSchema, FileMutationResponseSchema, FileTrashPayloadSchema,
  FileUploadResponseSchema, FileUploadsPayloadSchema, RenameFileRequestSchema, TrashFileRequestSchema, TrashMutationRequestSchema,
} from "@stackpilot/contracts";
import type { RequestContext } from "./types.js";
import { badRequest, notFound } from "./errors/ApiError.js";
import { sendJson } from "./response/json.js";
import { parseSchema } from "./validation.js";

function decodedHeader(context: RequestContext, name: string) {
  const raw = context.request.headers[name]; if (typeof raw !== "string") throw badRequest(`缺少 ${name} 请求头`);
  try { return decodeURIComponent(raw); } catch { throw badRequest(`${name} 请求头编码无效`); }
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
    sendJson(response, 201, { message: `${input.name} 已创建`, entry: await services.files.createDirectory(input.parentPath, input.name) }, FileMutationResponseSchema); return;
  }
  if (context.url.pathname === "/api/files/rename" && method === "PATCH") {
    context.identity?.require(context.principal, "files:write"); const input = parseSchema(RenameFileRequestSchema, context.body, "重命名文件");
    sendJson(response, 200, { message: "文件项已重命名", entry: await services.files.rename(input.path, input.name) }, FileMutationResponseSchema); return;
  }
  if (context.url.pathname === "/api/files/trash" && method === "POST") {
    context.identity?.require(context.principal, "files:write"); const input = parseSchema(TrashFileRequestSchema, context.body, "移入回收站");
    sendJson(response, 200, { message: "文件项已移入回收站", trashEntry: await services.files.trash(input.path) }, FileMutationResponseSchema); return;
  }
  if (context.url.pathname === "/api/file-trash" && method === "GET") { context.identity?.require(context.principal, "files:read"); sendJson(response, 200, await services.files.listTrash(), FileTrashPayloadSchema); return; }
  if (context.url.pathname === "/api/file-trash/restore" && method === "POST") {
    context.identity?.require(context.principal, "files:write"); const { id } = parseSchema(TrashMutationRequestSchema, context.body, "恢复文件");
    sendJson(response, 200, { message: "文件已恢复", entry: await services.files.restore(id) }, FileMutationResponseSchema); return;
  }
  if (context.url.pathname === "/api/file-trash" && method === "DELETE") {
    context.identity?.require(context.principal, "files:delete");
    const item = TrashMutationRequestSchema.safeParse(context.body); const empty = EmptyTrashRequestSchema.safeParse(context.body);
    if (!item.success && !empty.success) throw badRequest("永久删除请求必须指定有效文件 ID 或显式确认清空回收站");
    const proof = context.request.headers["x-reauth-proof"];
    context.identity?.consumeReauth(context.principal!, typeof proof === "string" ? proof : undefined);
    if (item.success) { await services.files.purge(item.data.id); sendJson(response, 200, { message: "文件已永久删除" }, FileMutationResponseSchema); }
    else { const count = await services.files.emptyTrash(); sendJson(response, 200, { message: `已永久删除 ${count} 个文件项` }, FileMutationResponseSchema); }
    return;
  }
  if (context.url.pathname === "/api/file-uploads" && method === "GET") { context.identity?.require(context.principal, "files:read"); sendJson(response, 200, await services.files.listUploads(), FileUploadsPayloadSchema); return; }
  if (context.url.pathname === "/api/file-uploads" && method === "POST") {
    context.identity?.require(context.principal, "files:write"); if (request.headers["content-type"] !== "application/octet-stream") throw badRequest("上传请求必须使用 application/octet-stream");
    const targetPath = decodedHeader(context, "x-file-target-path"); const name = decodedHeader(context, "x-file-name");
    const lengthHeader = context.request.headers["content-length"]; const contentLength = typeof lengthHeader === "string" ? Number(lengthHeader) : undefined;
    const result = await services.files.upload(targetPath, name, context.request, context.principal?.user.displayName ?? "unknown", Number.isFinite(contentLength) ? contentLength : undefined);
    sendJson(response, 201, { message: `${name} 上传完成`, ...result }, FileUploadResponseSchema); return;
  }
  if (["files", "file-trash", "file-uploads"].includes(parts[1] ?? "")) throw notFound("文件接口不存在");
}
