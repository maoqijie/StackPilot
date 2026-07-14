import { z } from "zod";
import { DatabaseIdempotencyKeySchema } from "./common.js";

export const DatabaseBackupSourceSchema = z.object({
  id: z.literal("controller-sqlite"), name: z.string().min(1), engine: z.literal("SQLite"),
  schemaVersion: z.number().int().positive(), sizeBytes: z.number().int().nonnegative().safe(), target: z.string().min(1),
}).strict();
export const DatabaseBackupRecordSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/), fileName: z.string().min(1).max(255), storage: z.string().min(1),
  createdAt: z.string().datetime(), sizeBytes: z.number().int().nonnegative().safe(), checksumStatus: z.enum(["pending", "verified"]),
  drillStatus: z.enum(["not_started", "succeeded"]), drilledAt: z.string().datetime().nullable(),
}).strict();
export const DatabaseBackupsPayloadSchema = z.object({
  collectedAt: z.string().datetime(), source: DatabaseBackupSourceSchema, backups: z.array(DatabaseBackupRecordSchema), warnings: z.array(z.string()),
}).strict();
export const CreateDatabaseBackupRequestSchema = z.object({ idempotencyKey: DatabaseIdempotencyKeySchema }).strict();
export const DatabaseBackupMutationResponseSchema = z.object({
  backup: DatabaseBackupRecordSchema, message: z.string().min(1), tone: z.enum(["success", "info", "warning", "danger"]),
}).strict();

export type DatabaseBackupSource = z.infer<typeof DatabaseBackupSourceSchema>;
export type DatabaseBackupRecord = z.infer<typeof DatabaseBackupRecordSchema>;
export type DatabaseBackupsPayload = z.infer<typeof DatabaseBackupsPayloadSchema>;
export type CreateDatabaseBackupRequest = z.infer<typeof CreateDatabaseBackupRequestSchema>;
export type DatabaseBackupMutationResponse = z.infer<typeof DatabaseBackupMutationResponseSchema>;

// Controller SQLite backup remains a system-level concern. Legacy names stay exported for rolling upgrades.
export const SystemBackupSourceSchema = DatabaseBackupSourceSchema;
export const SystemBackupRecordSchema = DatabaseBackupRecordSchema;
export const SystemBackupsPayloadSchema = DatabaseBackupsPayloadSchema;
export const CreateSystemBackupRequestSchema = CreateDatabaseBackupRequestSchema;
export const SystemBackupMutationResponseSchema = DatabaseBackupMutationResponseSchema;
export type SystemBackupSource = DatabaseBackupSource;
export type SystemBackupRecord = DatabaseBackupRecord;
export type SystemBackupsPayload = DatabaseBackupsPayload;
