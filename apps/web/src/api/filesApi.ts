import {
  FileListPayloadSchema, FileMutationResponseSchema, FileTrashPayloadSchema, FileUploadResponseSchema, FileUploadsPayloadSchema,
  type FileListPayload, type FileTrashPayload, type FileUploadsPayload,
} from "@stackpilot/contracts";
import { API_CLIENT_PREFIX } from "@stackpilot/contracts";
import { getCsrfToken, requestJson } from "./client";

export type { FileEntry, TrashFileEntry, FileUploadRecord } from "@stackpilot/contracts";
export const fetchFiles = (path: string, signal?: AbortSignal): Promise<FileListPayload> => requestJson(`/files?path=${encodeURIComponent(path)}`, { signal }).then(FileListPayloadSchema.parse);
export const createDirectory = (parentPath: string, name: string) => requestJson("/files/directories", { method: "POST", body: JSON.stringify({ parentPath, name }) }).then(FileMutationResponseSchema.parse);
export const renameFile = (path: string, name: string) => requestJson("/files/rename", { method: "PATCH", body: JSON.stringify({ path, name }) }).then(FileMutationResponseSchema.parse);
export const trashFile = (path: string) => requestJson("/files/trash", { method: "POST", body: JSON.stringify({ path }) }).then(FileMutationResponseSchema.parse);
export const fetchTrash = (signal?: AbortSignal): Promise<FileTrashPayload> => requestJson("/file-trash", { signal }).then(FileTrashPayloadSchema.parse);
export const restoreTrashFile = (id: string) => requestJson("/file-trash/restore", { method: "POST", body: JSON.stringify({ id }) }).then(FileMutationResponseSchema.parse);
export const purgeTrashFile = (id: string, proof: string) => requestJson("/file-trash", { method: "DELETE", headers: { "X-Reauth-Proof": proof }, body: JSON.stringify({ id }) }).then(FileMutationResponseSchema.parse);
export const emptyTrash = (proof: string) => requestJson("/file-trash", { method: "DELETE", headers: { "X-Reauth-Proof": proof }, body: JSON.stringify({ empty: true }) }).then(FileMutationResponseSchema.parse);
export const fetchUploads = (signal?: AbortSignal): Promise<FileUploadsPayload> => requestJson("/file-uploads", { signal }).then(FileUploadsPayloadSchema.parse);

export async function uploadFile(file: File, targetPath: string, signal?: AbortSignal) {
  const response = await fetch(`${API_CLIENT_PREFIX}/file-uploads`, {
    method: "POST", credentials: "include", signal, body: file,
    headers: { "Content-Type": "application/octet-stream", "X-CSRF-Token": getCsrfToken(), "X-File-Name": encodeURIComponent(file.name), "X-File-Target-Path": encodeURIComponent(targetPath) },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string; message?: string } | null;
    if (response.status === 401) window.dispatchEvent(new Event("stackpilot:session-expired"));
    throw new Error(payload?.error ?? payload?.message ?? `上传失败 (${response.status})`);
  }
  return FileUploadResponseSchema.parse(await response.json());
}
