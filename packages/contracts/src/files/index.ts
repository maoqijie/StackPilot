import { z } from "zod";

export const FileEntryKindSchema = z.enum(["file", "directory"]);
export const FileEntrySchema = z.object({
  id: z.string().min(16).max(128),
  name: z.string().min(1).max(255),
  path: z.string().min(1).max(4096),
  kind: FileEntryKindSchema,
  sizeBytes: z.number().int().nonnegative().nullable(),
  modifiedAt: z.string().datetime(),
  owner: z.string().min(1).max(120),
}).strict();

export const FileListPayloadSchema = z.object({
  root: z.string().min(1).max(4096),
  path: z.string().min(1).max(4096),
  entries: z.array(FileEntrySchema).max(10_000),
  collectedAt: z.string().datetime(),
}).strict();

export const CreateDirectoryRequestSchema = z.object({
  parentPath: z.string().min(1).max(4096),
  name: z.string().trim().min(1).max(255),
}).strict();
export const RenameFileRequestSchema = z.object({
  path: z.string().min(1).max(4096),
  name: z.string().trim().min(1).max(255),
}).strict();
export const TrashFileRequestSchema = z.object({ path: z.string().min(1).max(4096) }).strict();
export const TrashMutationRequestSchema = z.object({ id: z.string().uuid() }).strict();
export const EmptyTrashRequestSchema = z.object({ empty: z.literal(true) }).strict();

export const TrashFileEntrySchema = z.object({
  id: z.string().uuid(), name: z.string().min(1).max(255), originalPath: z.string().min(1).max(4096),
  kind: FileEntryKindSchema, sizeBytes: z.number().int().nonnegative().nullable(), deletedAt: z.string().datetime(),
  expiresAt: z.string().datetime(), owner: z.string().min(1).max(120),
}).strict();
export const FileTrashPayloadSchema = z.object({ entries: z.array(TrashFileEntrySchema).max(10_000), collectedAt: z.string().datetime() }).strict();
export const FileMutationResponseSchema = z.object({
  message: z.string(), entry: FileEntrySchema.optional(), trashEntry: TrashFileEntrySchema.optional(),
}).strict();

export const FileUploadRecordSchema = z.object({
  id: z.string().uuid(), name: z.string().min(1).max(255), targetPath: z.string().min(1).max(4096),
  sizeBytes: z.number().int().nonnegative(), status: z.enum(["completed", "failed"]), owner: z.string().min(1).max(128),
  startedAt: z.string().datetime(), completedAt: z.string().datetime(), error: z.string().max(240).nullable(),
}).strict();
export const FileUploadsPayloadSchema = z.object({
  uploads: z.array(FileUploadRecordSchema).max(500), collectedAt: z.string().datetime(), maxUploadBytes: z.number().int().positive(),
}).strict();
export const FileUploadResponseSchema = z.object({ message: z.string(), upload: FileUploadRecordSchema, entry: FileEntrySchema }).strict();

export type FileEntry = z.infer<typeof FileEntrySchema>;
export type FileListPayload = z.infer<typeof FileListPayloadSchema>;
export type TrashFileEntry = z.infer<typeof TrashFileEntrySchema>;
export type FileTrashPayload = z.infer<typeof FileTrashPayloadSchema>;
export type FileUploadRecord = z.infer<typeof FileUploadRecordSchema>;
export type FileUploadsPayload = z.infer<typeof FileUploadsPayloadSchema>;
