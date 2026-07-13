import { z } from "zod";

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
