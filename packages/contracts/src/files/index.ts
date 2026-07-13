import { z } from "zod";

export const FilePathSchema = z.string().min(1).max(4096).refine((value) => value.startsWith("/"), "文件路径必须是绝对路径");
export const FileNameSchema = z.string().trim().min(1).max(255).refine(
  (value) => value !== "." && value !== ".." && !/[\\/]/.test(value) && ![...value].some((character) => character.charCodeAt(0) < 32),
  "文件名无效",
);
export const FileEntrySchema = z.object({
  id: z.string().min(1), name: FileNameSchema, kind: z.enum(["file", "directory", "symlink"]),
  path: FilePathSchema, parentPath: FilePathSchema, sizeBytes: z.number().int().nonnegative().nullable(),
  modifiedAt: z.string().datetime(), owner: z.string().min(1),
}).strict();
export const FileListPayloadSchema = z.object({
  rootPath: FilePathSchema, path: FilePathSchema, parentPath: FilePathSchema.nullable(),
  entries: z.array(FileEntrySchema).max(5000), collectedAt: z.string().datetime(), writable: z.boolean(),
}).strict();
export const CreateDirectoryRequestSchema = z.object({ path: FilePathSchema, name: FileNameSchema }).strict();
export const RenameFileRequestSchema = z.object({ path: FilePathSchema, newName: FileNameSchema }).strict();
export const DeleteFileRequestSchema = z.object({ path: FilePathSchema }).strict();
export const FileMutationResponseSchema = z.object({ message: z.string().min(1).max(240), entry: FileEntrySchema.nullable() }).strict();

export type FileEntry = z.infer<typeof FileEntrySchema>;
export type FileListPayload = z.infer<typeof FileListPayloadSchema>;
