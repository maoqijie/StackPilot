import {
  API_CLIENT_PREFIX,
  FileListPayloadSchema,
  FileMutationResponseSchema,
  FileTrashPayloadSchema,
  FileUploadResponseSchema,
  FileUploadsPayloadSchema,
  type FileListPayload,
  type FileTrashPayload,
  type FileUploadsPayload,
} from "@stackpilot/contracts";
import { getCsrfToken, requestJson, responseError } from "./client";

export type { FileEntry, TrashFileEntry, FileUploadRecord } from "@stackpilot/contracts";

export const fetchFiles = (path: string, signal?: AbortSignal): Promise<FileListPayload> => requestJson(`/files?path=${encodeURIComponent(path)}`, { signal }).then(FileListPayloadSchema.parse);
export const createDirectory = (parentPath: string, name: string) => requestJson("/files/directories", { method: "POST", body: JSON.stringify({ parentPath, name }) }).then(FileMutationResponseSchema.parse);
export const renameFile = (path: string, name: string) => requestJson("/files/rename", { method: "PATCH", body: JSON.stringify({ path, name }) }).then(FileMutationResponseSchema.parse);
export const trashFile = (path: string) => requestJson("/files/trash", { method: "POST", body: JSON.stringify({ path }) }).then(FileMutationResponseSchema.parse);
export const deleteFile = trashFile;
export const fetchTrash = (signal?: AbortSignal): Promise<FileTrashPayload> => requestJson("/file-trash", { signal }).then(FileTrashPayloadSchema.parse);
export const restoreTrashFile = (id: string) => requestJson("/file-trash/restore", { method: "POST", body: JSON.stringify({ id }) }).then(FileMutationResponseSchema.parse);
export const purgeTrashFile = (id: string, proof: string) => requestJson("/file-trash", { method: "DELETE", headers: { "X-Reauth-Proof": proof }, body: JSON.stringify({ id }) }).then(FileMutationResponseSchema.parse);
export const emptyTrash = (proof: string) => requestJson("/file-trash", { method: "DELETE", headers: { "X-Reauth-Proof": proof }, body: JSON.stringify({ empty: true }) }).then(FileMutationResponseSchema.parse);
export const fetchUploads = (signal?: AbortSignal): Promise<FileUploadsPayload> => requestJson("/file-uploads", { signal }).then(FileUploadsPayloadSchema.parse);

export function uploadFile(file: File, targetPath: string, signal?: AbortSignal): Promise<ReturnType<typeof FileUploadResponseSchema.parse>>;
export function uploadFile(targetPath: string, file: File, signal?: AbortSignal): Promise<ReturnType<typeof FileUploadResponseSchema.parse>>;
export async function uploadFile(fileOrPath: File | string, pathOrFile: string | File, signal?: AbortSignal) {
  const file = fileOrPath instanceof File ? fileOrPath : pathOrFile as File;
  const targetPath = typeof fileOrPath === "string" ? fileOrPath : pathOrFile as string;
  const response = await fetch(`${API_CLIENT_PREFIX}/file-uploads`, {
    method: "POST",
    credentials: "include",
    signal,
    body: file,
    headers: {
      "Content-Type": "application/octet-stream",
      "X-CSRF-Token": getCsrfToken(),
      "X-File-Name": encodeURIComponent(file.name),
      "X-File-Target-Path": encodeURIComponent(targetPath),
    },
  });
  if (!response.ok) throw await responseError(response);
  return FileUploadResponseSchema.parse(await response.json());
}
