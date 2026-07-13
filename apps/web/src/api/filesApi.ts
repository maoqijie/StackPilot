import { FileListPayloadSchema, FileMutationResponseSchema } from "@stackpilot/contracts";
import type { FileListPayload } from "@stackpilot/contracts";
import {
  CreateFileUploadRequestSchema, FileUploadClearResponseSchema, FileUploadChunkResponseSchema,
  FileUploadListResponseSchema, FileUploadMutationResponseSchema,
  type CreateFileUploadRequest, type FileUploadListResponse, type FileUploadRecord,
} from "@stackpilot/contracts";
import { getCsrfToken, requestJson, responseError } from "./client";

export async function listFileUploads(signal?: AbortSignal): Promise<FileUploadListResponse> {
  return FileUploadListResponseSchema.parse(await requestJson("/file-uploads", { signal }));
}
export async function createFileUpload(input: CreateFileUploadRequest): Promise<FileUploadRecord> {
  const body = CreateFileUploadRequestSchema.parse(input);
  const response = await requestJson("/file-uploads", { method: "POST", body: JSON.stringify(body) });
  return FileUploadMutationResponseSchema.parse(response).upload;
}
export async function completeFileUpload(id: string, signal?: AbortSignal): Promise<FileUploadRecord> {
  const response = await requestJson(`/file-uploads/${encodeURIComponent(id)}/complete`, { method: "POST", body: "{}", signal });
  return FileUploadMutationResponseSchema.parse(response).upload;
}
export async function cancelFileUpload(id: string): Promise<FileUploadRecord> {
  const response = await requestJson(`/file-uploads/${encodeURIComponent(id)}`, { method: "DELETE", body: "{}" });
  return FileUploadMutationResponseSchema.parse(response).upload;
}
export async function clearCompletedFileUploads(): Promise<number> {
  const response = await requestJson("/file-uploads/clear-completed", { method: "POST", body: "{}" });
  return FileUploadClearResponseSchema.parse(response).removed;
}
export async function uploadFileChunk(id: string, offset: number, chunk: Blob, signal?: AbortSignal): Promise<FileUploadRecord> {
  const response = await fetch(`/api/file-uploads/${encodeURIComponent(id)}/chunks`, {
    method: "POST", credentials: "include", body: chunk, signal,
    headers: { "Content-Type": "application/octet-stream", "Upload-Offset": String(offset), "X-CSRF-Token": getCsrfToken() },
  });
  if (!response.ok) throw await responseError(response);
  return FileUploadChunkResponseSchema.parse(await response.json()).upload;
}

export function fetchFiles(path:string,signal?:AbortSignal):Promise<FileListPayload>{return requestJson(`/files?path=${encodeURIComponent(path)}`,{signal}).then((value)=>FileListPayloadSchema.parse(value));}
export function createDirectory(path:string,name:string){return requestJson("/files/directories",{method:"POST",body:JSON.stringify({path,name})}).then((value)=>FileMutationResponseSchema.parse(value));}
export function renameFile(path:string,newName:string){return requestJson("/files/rename",{method:"PATCH",body:JSON.stringify({path,newName})}).then((value)=>FileMutationResponseSchema.parse(value));}
export function deleteFile(path:string){return requestJson("/files",{method:"DELETE",body:JSON.stringify({path})}).then((value)=>FileMutationResponseSchema.parse(value));}
export function uploadFile(path:string,file:File){return requestJson("/files/upload",{method:"POST",body:file,headers:{"Content-Type":"application/octet-stream","X-File-Path":path,"X-File-Name":encodeURIComponent(file.name)}}).then((value)=>FileMutationResponseSchema.parse(value));}
