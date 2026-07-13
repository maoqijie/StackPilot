import { z } from "zod";
import { DatabaseEngineSchema, DatabaseIdSchema, DatabaseIdempotencyKeySchema, DatabaseOperationStatusSchema } from "./common.js";

export const DatabaseOperationKindSchema = z.enum(["install", "set-read-only", "set-read-write", "terminate-session", "create-index", "restore", "backup", "explain"]);
const InstallOperationSchema = z.object({
  kind: z.literal("install"), nodeId: z.string().uuid(), engine: DatabaseEngineSchema, name: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/),
  port: z.number().int().min(1).max(65_535).nullable(), initialDatabase: z.string().trim().min(1).max(63).regex(/^[A-Za-z0-9_-]+$/),
  credentialPublicKey: z.string().min(64).max(8_192),
}).strict();
const InstanceOperationSchema = z.object({
  kind: z.enum(["set-read-only", "set-read-write"]), instanceId: DatabaseIdSchema,
}).strict();
const SessionOperationSchema = z.object({ kind: z.literal("terminate-session"), instanceId: DatabaseIdSchema, sessionId: z.string().min(1).max(160) }).strict();
const IndexOperationSchema = z.object({
  kind: z.literal("create-index"), instanceId: DatabaseIdSchema, queryId: z.string().min(1).max(160),
  table: z.string().min(1).max(128).regex(/^[A-Za-z_][A-Za-z0-9_$]*$/),
  columns: z.array(z.string().min(1).max(128).regex(/^[A-Za-z_][A-Za-z0-9_$]*$/)).min(1).max(8),
}).strict();
const RestoreOperationSchema = z.object({ kind: z.literal("restore"), instanceId: DatabaseIdSchema, restorePointId: z.string().uuid() }).strict();
export const CreateDatabaseOperationPlanRequestSchema = z.discriminatedUnion("kind", [
  InstallOperationSchema, InstanceOperationSchema, SessionOperationSchema, IndexOperationSchema, RestoreOperationSchema,
]);
export const DatabaseOperationPlanSchema = z.object({
  id: z.string().uuid(), kind: DatabaseOperationKindSchema.exclude(["backup", "explain"]), nodeId: z.string().uuid(), instanceId: DatabaseIdSchema.nullable(),
  target: z.string().min(1).max(300), impact: z.array(z.string().min(1).max(500)).min(1).max(10),
  version: z.number().int().positive(), expiresAt: z.string().datetime(), createdAt: z.string().datetime(), executedAt: z.string().datetime().nullable(),
}).strict();
export const ExecuteDatabaseOperationPlanRequestSchema = z.object({
  planId: z.string().uuid(), version: z.number().int().positive(), idempotencyKey: DatabaseIdempotencyKeySchema,
}).strict();
export const DatabaseCredentialEnvelopeSchema = z.object({
  algorithm: z.literal("RSA-OAEP-256"), ciphertext: z.string().min(1).max(32_768), expiresAt: z.string().datetime(),
}).strict();
const DatabaseBackupOperationResultSchema = z.object({
  kind: z.literal("backup"), restorePointId: z.string().uuid(), createdAt: z.string().datetime(),
  sizeBytes: z.number().int().nonnegative().safe(), checksum: z.string().regex(/^[a-f0-9]{64}$/),
  databaseVersion: z.string().min(1).max(80), manifestVersion: z.number().int().positive(),
}).strict();
const DatabaseExplainOperationResultSchema = z.object({
  kind: z.literal("explain"), format: z.enum(["json", "text"]), plan: z.string().min(1).max(262_144),
}).strict();
const DatabaseInstallOperationResultSchema = z.object({
  kind: z.literal("install"), instanceLocalId: z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/),
  engine: DatabaseEngineSchema, port: z.number().int().min(1).max(65_535),
  serviceName: z.string().min(1).max(120).regex(/^[A-Za-z0-9_.@:-]+$/),
}).strict();
const DatabaseRestoreOperationResultSchema = z.object({
  kind: z.literal("restore"), restorePointId: z.string().uuid(), health: z.literal("healthy"),
  rollbackExpiresAt: z.string().datetime(),
}).strict();
export const DatabaseOperationResultSchema = z.discriminatedUnion("kind", [
  DatabaseBackupOperationResultSchema, DatabaseExplainOperationResultSchema,
  DatabaseInstallOperationResultSchema, DatabaseRestoreOperationResultSchema,
]);
export const DatabaseOperationSchema = z.object({
  id: z.string().uuid(), kind: DatabaseOperationKindSchema, nodeId: z.string().uuid(), instanceId: DatabaseIdSchema.nullable(),
  status: DatabaseOperationStatusSchema, version: z.number().int().positive(), errorCode: z.string().min(1).max(100).nullable(),
  errorMessage: z.string().min(1).max(500).nullable(), requestedBy: z.string().uuid(), requestId: z.string().min(1).max(160),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(), completedAt: z.string().datetime().nullable(),
  credentialEnvelope: DatabaseCredentialEnvelopeSchema.nullable(), result: DatabaseOperationResultSchema.nullable().default(null),
}).strict();
export const DatabaseOperationResponseSchema = z.object({ operation: DatabaseOperationSchema }).strict();
export const DatabaseOperationPlanResponseSchema = z.object({ plan: DatabaseOperationPlanSchema }).strict();
export const AgentDatabaseOperationUpdateSchema = z.object({
  operationId: z.string().uuid(), version: z.number().int().positive(), status: z.enum(["running", "succeeded", "failed"]),
  errorCode: z.string().min(1).max(100).nullable(), errorMessage: z.string().min(1).max(500).nullable(),
  credentialEnvelope: DatabaseCredentialEnvelopeSchema.nullable(), result: DatabaseOperationResultSchema.nullable().default(null), updatedAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  if (value.status === "failed" && !value.errorCode) context.addIssue({ code:"custom",path:["errorCode"],message:"failed operation requires errorCode" });
  if (value.credentialEnvelope && value.status !== "succeeded") context.addIssue({ code:"custom",path:["credentialEnvelope"],message:"credentials require succeeded status" });
  if (value.result && value.status !== "succeeded") context.addIssue({ code:"custom",path:["result"],message:"operation result requires succeeded status" });
});

export type CreateDatabaseOperationPlanRequest = z.infer<typeof CreateDatabaseOperationPlanRequestSchema>;
export type DatabaseOperationPlan = z.infer<typeof DatabaseOperationPlanSchema>;
export type ExecuteDatabaseOperationPlanRequest = z.infer<typeof ExecuteDatabaseOperationPlanRequestSchema>;
export type DatabaseOperation = z.infer<typeof DatabaseOperationSchema>;
export type DatabaseOperationKind = z.infer<typeof DatabaseOperationKindSchema>;
export type DatabaseOperationResult = z.infer<typeof DatabaseOperationResultSchema>;
