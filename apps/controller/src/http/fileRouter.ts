import {
  CreateDirectoryRequestSchema, CreateFileUploadRequestSchema, DeleteFileRequestSchema, EmptyObjectSchema,
  FileListPayloadSchema, FileMutationResponseSchema, FileNameSchema, FilePathSchema,
  FileUploadChunkResponseSchema, FileUploadClearResponseSchema, FileUploadListResponseSchema,
  FileUploadMutationResponseSchema, RenameFileRequestSchema,
} from "@stackpilot/contracts";
import type { RequestContext } from "./types.js";
import { ApiError, badRequest, notFound } from "./errors/ApiError.js";
import { sendJson } from "./response/json.js";
import { parseSchema } from "./validation.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uploadId(context: RequestContext): string { const value=context.parts[2]??"";if(!UUID.test(value))throw new ApiError(400,"BAD_REQUEST","上传任务 ID 无效");return value; }
function uploadService(context: RequestContext) { if(!context.services.fileUploads)throw new ApiError(503,"NOT_READY","文件上传服务未配置");return context.services.fileUploads; }
function integerHeader(context:RequestContext,name:"upload-offset"|"content-length"):number{const value=context.request.headers[name];if(typeof value!=="string"||!/^(0|[1-9]\d*)$/.test(value))throw new ApiError(400,"BAD_REQUEST",`${name} 请求头无效`);const parsed=Number(value);if(!Number.isSafeInteger(parsed))throw new ApiError(400,"BAD_REQUEST",`${name} 请求头无效`);return parsed;}

export async function routeFileManagerRequest(context:RequestContext){const{request,response,parts,services,url}=context,method=request.method??"GET";
  if(parts.length===2&&method==="GET"){context.identity?.require(context.principal,"files:read");if(url.searchParams.size!==1||!url.searchParams.has("path"))throw badRequest("查询参数无效");const path=parseSchema(FilePathSchema,url.searchParams.get("path"),"文件路径");sendJson(response,200,await services.fileManager.list(path),FileListPayloadSchema);return;}
  if(url.searchParams.size)throw badRequest("查询参数无效");context.identity?.require(context.principal,"files:manage");
  if(parts[2]==="directories"&&parts.length===3&&method==="POST"){const input=parseSchema(CreateDirectoryRequestSchema,context.body,"创建目录");const entry=await services.fileManager.createDirectory(input.path,input.name);sendJson(response,201,{message:`${entry.name} 已创建`,entry},FileMutationResponseSchema);return;}
  if(parts[2]==="rename"&&parts.length===3&&method==="PATCH"){const input=parseSchema(RenameFileRequestSchema,context.body,"重命名");const entry=await services.fileManager.rename(input.path,input.newName);sendJson(response,200,{message:`已重命名为 ${entry.name}`,entry},FileMutationResponseSchema);return;}
  if(parts.length===2&&method==="DELETE"){const input=parseSchema(DeleteFileRequestSchema,context.body,"删除文件");const name=await services.fileManager.moveToTrash(input.path);sendJson(response,200,{message:`${name} 已移入回收站`,entry:null},FileMutationResponseSchema);return;}
  if(parts[2]==="upload"&&parts.length===3&&method==="POST"){let decodedName:string;try{decodedName=decodeURIComponent(String(request.headers["x-file-name"]??""));}catch{throw badRequest("文件名编码无效");}const path=parseSchema(FilePathSchema,request.headers["x-file-path"],"目标目录"),name=parseSchema(FileNameSchema,decodedName,"文件名");const entry=await services.fileManager.upload(path,name,context.rawBody);sendJson(response,201,{message:`${entry.name} 已上传`,entry},FileMutationResponseSchema);return;}
  throw notFound("文件接口不存在");
}

export async function routeFileUploadRequest(context:RequestContext):Promise<void>{const method=context.request.method??"GET",service=uploadService(context);
  if(context.parts.length===2&&method==="GET"){context.identity?.require(context.principal,"files:read");sendJson(context.response,200,await service.list(),FileUploadListResponseSchema);return;}
  if(context.parts.length===2&&method==="POST"){context.identity?.require(context.principal,"files:write");const input=parseSchema(CreateFileUploadRequestSchema,context.body,"上传任务");sendJson(context.response,201,{upload:await service.create(context.principal!,input)},FileUploadMutationResponseSchema);return;}
  if(context.parts[2]==="clear-completed"&&context.parts.length===3&&method==="POST"){context.identity?.require(context.principal,"files:write");sendJson(context.response,200,{removed:service.clearCompleted()},FileUploadClearResponseSchema);return;}
  if(context.parts[3]==="chunks"&&context.parts.length===4&&method==="POST"){context.identity?.require(context.principal,"files:write");if(context.request.headers["content-type"]!=="application/octet-stream")throw new ApiError(400,"BAD_REQUEST","上传分片必须使用 application/octet-stream");let upload;try{upload=await service.append(uploadId(context),integerHeader(context,"upload-offset"),integerHeader(context,"content-length"),context.request);}catch(error){context.request.resume();throw error;}sendJson(context.response,200,{upload,nextOffset:upload.receivedBytes},FileUploadChunkResponseSchema);return;}
  if(context.parts[3]==="complete"&&context.parts.length===4&&method==="POST"){context.identity?.require(context.principal,"files:write");parseSchema(EmptyObjectSchema,context.body,"请求体");sendJson(context.response,200,{upload:await service.complete(uploadId(context))},FileUploadMutationResponseSchema);return;}
  if(context.parts.length===3&&method==="DELETE"){context.identity?.require(context.principal,"files:write");sendJson(context.response,200,{upload:await service.cancel(uploadId(context))},FileUploadMutationResponseSchema);return;}
  throw notFound("文件上传接口不存在");
}
