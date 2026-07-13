import { CreateDirectoryRequestSchema, DeleteFileRequestSchema, FileListPayloadSchema, FileMutationResponseSchema, FileNameSchema, FilePathSchema, RenameFileRequestSchema } from "@stackpilot/contracts";
import type { RequestContext } from "./types.js";
import { badRequest, notFound } from "./errors/ApiError.js";
import { sendJson } from "./response/json.js";
import { parseSchema } from "./validation.js";

export async function routeFileRequest(context:RequestContext){const{request,response,parts,services,url}=context,method=request.method??"GET";
  if(parts.length===2&&method==="GET"){context.identity?.require(context.principal,"files:read");if(url.searchParams.size!==1||!url.searchParams.has("path"))throw badRequest("查询参数无效");const path=parseSchema(FilePathSchema,url.searchParams.get("path"),"文件路径");sendJson(response,200,await services.files.list(path),FileListPayloadSchema);return;}
  if(url.searchParams.size)throw badRequest("查询参数无效");context.identity?.require(context.principal,"files:manage");
  if(parts[2]==="directories"&&parts.length===3&&method==="POST"){const input=parseSchema(CreateDirectoryRequestSchema,context.body,"创建目录");const entry=await services.files.createDirectory(input.path,input.name);sendJson(response,201,{message:`${entry.name} 已创建`,entry},FileMutationResponseSchema);return;}
  if(parts[2]==="rename"&&parts.length===3&&method==="PATCH"){const input=parseSchema(RenameFileRequestSchema,context.body,"重命名");const entry=await services.files.rename(input.path,input.newName);sendJson(response,200,{message:`已重命名为 ${entry.name}`,entry},FileMutationResponseSchema);return;}
  if(parts.length===2&&method==="DELETE"){const input=parseSchema(DeleteFileRequestSchema,context.body,"删除文件");const name=await services.files.moveToTrash(input.path);sendJson(response,200,{message:`${name} 已移入回收站`,entry:null},FileMutationResponseSchema);return;}
  if(parts[2]==="upload"&&parts.length===3&&method==="POST"){let decodedName:string;try{decodedName=decodeURIComponent(String(request.headers["x-file-name"]??""));}catch{throw badRequest("文件名编码无效");}const path=parseSchema(FilePathSchema,request.headers["x-file-path"],"目标目录"),name=parseSchema(FileNameSchema,decodedName,"文件名");const entry=await services.files.upload(path,name,context.rawBody);sendJson(response,201,{message:`${entry.name} 已上传`,entry},FileMutationResponseSchema);return;}
  throw notFound("文件接口不存在");
}
