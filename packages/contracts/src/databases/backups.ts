import { z } from "zod";
import { DatabaseCollectionEnvelopeSchema, DatabaseIdSchema, DatabaseIdempotencyKeySchema, DatabaseOperationStatusSchema } from "./common.js";
import { DatabaseBackupCronSchema } from "./cron.js";

export const BusinessDatabaseBackupPlanSchema = z.object({
  id: z.string().uuid(), instanceId: DatabaseIdSchema, name: z.string().min(1).max(120), cron: DatabaseBackupCronSchema,
  retentionCount: z.number().int().min(1).max(30), enabled: z.boolean(), version: z.number().int().positive(),
  lastRunAt: z.string().datetime().nullable(), nextRunAt: z.string().datetime().nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).strict();
export const DatabaseBackupJobSchema = z.object({
  id: z.string().uuid(), planId: z.string().uuid().nullable(), instanceId: DatabaseIdSchema, status: DatabaseOperationStatusSchema,
  startedAt: z.string().datetime().nullable(), completedAt: z.string().datetime().nullable(), sizeBytes: z.number().int().nonnegative().safe().nullable(),
  errorCode: z.string().min(1).max(100).nullable(), manifestVersion: z.number().int().positive().nullable(), checksum: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
}).strict();
export const DatabaseRestorePointSchema = z.object({
  id: z.string().uuid(), jobId: z.string().uuid(), instanceId: DatabaseIdSchema, createdAt: z.string().datetime(),
  sizeBytes: z.number().int().nonnegative().safe(), checksum: z.string().regex(/^[a-f0-9]{64}$/),
  databaseVersion: z.string().min(1).max(80), manifestVersion: z.number().int().positive(), verifiedAt: z.string().datetime().nullable(),
  drillStatus: z.enum(["not_started", "succeeded", "failed"]), drilledAt: z.string().datetime().nullable(),
}).strict();
export const BusinessDatabaseBackupsPayloadSchema = DatabaseCollectionEnvelopeSchema.extend({
  plans: z.array(BusinessDatabaseBackupPlanSchema).max(10_000), jobs: z.array(DatabaseBackupJobSchema).max(10_000),
  restorePoints: z.array(DatabaseRestorePointSchema).max(10_000),
}).strict();
export const CreateBusinessDatabaseBackupPlanRequestSchema = z.object({
  instanceId: DatabaseIdSchema, name: z.string().trim().min(1).max(120), cron: DatabaseBackupCronSchema,
  retentionCount: z.number().int().min(1).max(30), enabled: z.boolean().default(true),
}).strict();
export const UpdateBusinessDatabaseBackupPlanRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(), cron: DatabaseBackupCronSchema.optional(),
  retentionCount: z.number().int().min(1).max(30).optional(), enabled: z.boolean().optional(), version: z.number().int().positive(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== "version"), { message: "at least one field must be updated" });
export const RunBusinessDatabaseBackupPlanRequestSchema = z.object({ idempotencyKey: DatabaseIdempotencyKeySchema }).strict();
export const BusinessDatabaseBackupPlanResponseSchema = z.object({ plan: BusinessDatabaseBackupPlanSchema }).strict();
export const RunBusinessDatabaseBackupPlanResponseSchema = z.object({
  operationId: z.string().uuid(), status: DatabaseOperationStatusSchema, job: DatabaseBackupJobSchema,
}).strict();

export type BusinessDatabaseBackupPlan = z.infer<typeof BusinessDatabaseBackupPlanSchema>;
export type DatabaseBackupJob = z.infer<typeof DatabaseBackupJobSchema>;
export type DatabaseRestorePoint = z.infer<typeof DatabaseRestorePointSchema>;
export type BusinessDatabaseBackupsPayload = z.infer<typeof BusinessDatabaseBackupsPayloadSchema>;
export type CreateBusinessDatabaseBackupPlanRequest = z.infer<typeof CreateBusinessDatabaseBackupPlanRequestSchema>;
export type UpdateBusinessDatabaseBackupPlanRequest = z.infer<typeof UpdateBusinessDatabaseBackupPlanRequestSchema>;
