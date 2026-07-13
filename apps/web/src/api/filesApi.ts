import { FileListPayloadSchema, FileMutationResponseSchema } from "@stackpilot/contracts";
import type { FileListPayload } from "@stackpilot/contracts";
import { requestJson } from "./client";

export function fetchFiles(path:string,signal?:AbortSignal):Promise<FileListPayload>{return requestJson(`/files?path=${encodeURIComponent(path)}`,{signal}).then((value)=>FileListPayloadSchema.parse(value));}
export function createDirectory(path:string,name:string){return requestJson("/files/directories",{method:"POST",body:JSON.stringify({path,name})}).then((value)=>FileMutationResponseSchema.parse(value));}
export function renameFile(path:string,newName:string){return requestJson("/files/rename",{method:"PATCH",body:JSON.stringify({path,newName})}).then((value)=>FileMutationResponseSchema.parse(value));}
export function deleteFile(path:string){return requestJson("/files",{method:"DELETE",body:JSON.stringify({path})}).then((value)=>FileMutationResponseSchema.parse(value));}
export function uploadFile(path:string,file:File){return requestJson("/files/upload",{method:"POST",body:file,headers:{"Content-Type":"application/octet-stream","X-File-Path":path,"X-File-Name":encodeURIComponent(file.name)}}).then((value)=>FileMutationResponseSchema.parse(value));}
