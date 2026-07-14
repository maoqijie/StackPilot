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

const VirtualFilePathSchema = z.string().min(1).max(4096).refine((value) => value.startsWith("/"), "文件路径必须是绝对虚拟路径");
const ManagedFileNameSchema = z.string().trim().min(1).max(255).refine(
  (value) => value !== "." && value !== ".." && !/[\\/\0]/.test(value) && ![...value].some((character) => character.charCodeAt(0) < 32),
  "文件名无效",
);
export const CreateDirectoryRequestSchema = z.object({ parentPath: VirtualFilePathSchema, name: ManagedFileNameSchema }).strict();
export const RenameFileRequestSchema = z.object({
  path: VirtualFilePathSchema,
  name: ManagedFileNameSchema,
}).strict();
export const TrashFileRequestSchema = z.object({ path: VirtualFilePathSchema }).strict();
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

const ResumableUploadDirectorySchema = z.string().trim().max(512).refine(
  (value) => !value || (!value.startsWith("/") && !value.includes("\\") && !value.includes("\0") && value.split("/").every((part) => part.length > 0 && part !== "." && part !== "..")),
  "上传目录必须是安全相对路径",
);
const ResumableUploadNameSchema = z.string().trim().min(1).max(255).refine((value) => value !== "." && value !== ".." && !/[\\/\0]/.test(value), "上传文件名无效");
const ResumableUploadTargetSchema = z.string().min(1).max(1024).refine(
  (value) => !value.startsWith("/") && !value.includes("\\") && !value.includes("\0") && value.split("/").every((part) => part.length > 0 && part !== "." && part !== ".."),
  "上传目标必须位于上传根目录内",
);

export const FileUploadStatusSchema = z.enum(["waiting", "uploading", "completed", "failed", "cancelled"]);
export const ResumableFileUploadRecordSchema = z.object({
  id: z.string().uuid(), fileName: ResumableUploadNameSchema, targetDirectory: ResumableUploadDirectorySchema,
  targetPath: ResumableUploadTargetSchema, sizeBytes: z.number().int().nonnegative().safe(),
  receivedBytes: z.number().int().nonnegative().safe(), status: FileUploadStatusSchema,
  owner: z.string().min(1).max(128), contentType: z.string().min(1).max(255),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(), errorMessage: z.string().min(1).max(512).nullable(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(), completedAt: z.string().datetime().nullable(),
}).strict().superRefine((value, context) => {
  if (value.receivedBytes > value.sizeBytes) context.addIssue({ code: "custom", path: ["receivedBytes"], message: "已接收字节超过声明大小" });
  if (value.status === "completed" && value.receivedBytes !== value.sizeBytes) context.addIssue({ code: "custom", path: ["status"], message: "已完成任务的字节数不匹配" });
});
export const FileUploadListResponseSchema = z.object({
  uploads: z.array(ResumableFileUploadRecordSchema).max(1_000), collectedAt: z.string().datetime(),
  maxFileBytes: z.number().int().positive().safe(), chunkBytes: z.number().int().positive().safe(),
}).strict();
export const CreateFileUploadRequestSchema = z.object({
  fileName: ResumableUploadNameSchema, targetDirectory: ResumableUploadDirectorySchema.default(""),
  sizeBytes: z.number().int().nonnegative().safe(), contentType: z.string().trim().min(1).max(255).default("application/octet-stream"),
  idempotencyKey: z.string().min(8).max(160).regex(/^[A-Za-z0-9:_-]+$/),
}).strict();
export const FileUploadChunkResponseSchema = z.object({ upload: ResumableFileUploadRecordSchema, nextOffset: z.number().int().nonnegative().safe() }).strict();
export const FileUploadMutationResponseSchema = z.object({ upload: ResumableFileUploadRecordSchema }).strict();
export const FileUploadClearResponseSchema = z.object({ removed: z.number().int().nonnegative() }).strict();
export type ResumableFileUploadRecord = z.infer<typeof ResumableFileUploadRecordSchema>;
export type FileUploadListResponse = z.infer<typeof FileUploadListResponseSchema>;
export type CreateFileUploadRequest = z.infer<typeof CreateFileUploadRequestSchema>;
