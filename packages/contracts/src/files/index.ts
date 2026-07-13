import { z } from "zod";

export const TrashEntryKindSchema = z.enum(["file", "directory"]);
export type TrashEntryKind = z.infer<typeof TrashEntryKindSchema>;

export const TrashEntrySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  kind: TrashEntryKindSchema,
  originalPath: z.string().startsWith("/"),
  sizeBytes: z.number().int().nonnegative().nullable(),
  deletedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  owner: z.string().min(1),
  reason: z.string().min(1),
}).strict();
export type TrashEntry = z.infer<typeof TrashEntrySchema>;

export const RestoredTrashEntrySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  originalPath: z.string().startsWith("/"),
  restoredAt: z.string().datetime(),
  restoredBy: z.string().min(1),
}).strict();
export type RestoredTrashEntry = z.infer<typeof RestoredTrashEntrySchema>;

export const TrashPayloadSchema = z.object({
  entries: z.array(TrashEntrySchema),
  recentlyRestored: z.array(RestoredTrashEntrySchema),
  retentionDays: z.number().int().positive(),
  collectedAt: z.string().datetime(),
}).strict();
export type TrashPayload = z.infer<typeof TrashPayloadSchema>;

export const TrashMutationResponseSchema = z.object({
  message: z.string().min(1),
  trash: TrashPayloadSchema,
}).strict();
export type TrashMutationResponse = z.infer<typeof TrashMutationResponseSchema>;

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

const UploadIdSchema = z.string().uuid();
const UploadDirectorySchema = z.string().trim().max(512).refine(
  (value) => !value || (!value.startsWith("/") && !value.includes("\\") && !value.includes("\0") && value.split("/").every((part) => part.length > 0 && part !== "." && part !== "..")),
  "must be a safe relative directory",
);
const UploadFileNameSchema = z.string().trim().min(1).max(255).refine(
  (value) => value !== "." && value !== ".." && !/[\\/\0]/.test(value),
  "must be a base file name",
);
const UploadTargetPathSchema = z.string().min(1).max(1024).refine(
  (value) => !value.startsWith("/") && !value.includes("\\") && !value.includes("\0") && value.split("/").every((part) => part.length > 0 && part !== "." && part !== ".."),
  "must remain within the upload root",
);

export const FileUploadStatusSchema = z.enum(["waiting", "uploading", "completed", "failed", "cancelled"]);
export const FileUploadRecordSchema = z.object({
  id: UploadIdSchema,
  fileName: UploadFileNameSchema,
  targetDirectory: UploadDirectorySchema,
  targetPath: UploadTargetPathSchema,
  sizeBytes: z.number().int().nonnegative().safe(),
  receivedBytes: z.number().int().nonnegative().safe(),
  status: FileUploadStatusSchema,
  owner: z.string().min(1).max(128),
  contentType: z.string().min(1).max(255),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  errorMessage: z.string().min(1).max(512).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
}).strict().superRefine((value, context) => {
  if (value.receivedBytes > value.sizeBytes) context.addIssue({ code: "custom", path: ["receivedBytes"], message: "received bytes exceed size" });
  if (value.status === "completed" && value.receivedBytes !== value.sizeBytes) context.addIssue({ code: "custom", path: ["status"], message: "completed upload size mismatch" });
});

export const FileUploadListResponseSchema = z.object({
  uploads: z.array(FileUploadRecordSchema).max(1_000),
  collectedAt: z.string().datetime(),
  maxFileBytes: z.number().int().positive().safe(),
  chunkBytes: z.number().int().positive().safe(),
}).strict();

export const CreateFileUploadRequestSchema = z.object({
  fileName: UploadFileNameSchema,
  targetDirectory: UploadDirectorySchema.default(""),
  sizeBytes: z.number().int().nonnegative().safe(),
  contentType: z.string().trim().min(1).max(255).default("application/octet-stream"),
  idempotencyKey: z.string().min(8).max(160).regex(/^[A-Za-z0-9:_-]+$/),
}).strict();

export const FileUploadChunkResponseSchema = z.object({
  upload: FileUploadRecordSchema,
  nextOffset: z.number().int().nonnegative().safe(),
}).strict();
export const FileUploadMutationResponseSchema = z.object({ upload: FileUploadRecordSchema }).strict();
export const FileUploadClearResponseSchema = z.object({ removed: z.number().int().nonnegative() }).strict();

export type FileUploadRecord = z.infer<typeof FileUploadRecordSchema>;
export type FileUploadListResponse = z.infer<typeof FileUploadListResponseSchema>;
export type CreateFileUploadRequest = z.infer<typeof CreateFileUploadRequestSchema>;
