import { z } from "zod";
import {
  AgentDatabaseOperationUpdateSchema, AgentDatabaseQueryUploadSchema, AgentDatabaseSnapshotSchema,
  DatabaseEngineSchema, DatabaseOperationKindSchema,
} from "../databases/index.js";

const LocalIdSchema = z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/);
const IdentifierSchema = z.string().min(1).max(128).regex(/^[A-Za-z_][A-Za-z0-9_$]*$/);
export const AGENT_DATABASE_UPLOAD_LIMIT_BYTES = 900 * 1024;

const InstallParametersSchema = z.object({
  kind: z.literal("install"), engine: DatabaseEngineSchema, name: LocalIdSchema,
  port: z.number().int().min(1).max(65_535).nullable(), initialDatabase: IdentifierSchema,
  credentialPublicKey: z.string().min(64).max(8_192),
}).strict();
const InstanceParametersSchema = z.object({
  kind: z.enum(["set-read-only", "set-read-write"]), instanceLocalId: LocalIdSchema,
}).strict();
const BackupParametersSchema = z.object({
  kind: z.literal("backup"), instanceLocalId: LocalIdSchema, retentionCount: z.number().int().min(1).max(30),
}).strict();
const SessionParametersSchema = z.object({
  kind: z.literal("terminate-session"), instanceLocalId: LocalIdSchema,
  sessionId: z.string().min(1).max(32).regex(/^\d+$/),
}).strict();
const ExplainParametersSchema = z.object({
  kind: z.literal("explain"), instanceLocalId: LocalIdSchema,
  sql: z.string().trim().min(1).max(65_536),
}).strict();
const IndexParametersSchema = z.object({
  kind: z.literal("create-index"), instanceLocalId: LocalIdSchema, table: IdentifierSchema,
  columns: z.array(IdentifierSchema).min(1).max(8),
}).strict();
const RestoreParametersSchema = z.object({
  kind: z.literal("restore"), instanceLocalId: LocalIdSchema, restorePointId: z.string().uuid(),
}).strict();

export const AgentDatabaseOperationParametersSchema = z.discriminatedUnion("kind", [
  InstallParametersSchema, InstanceParametersSchema, BackupParametersSchema, SessionParametersSchema,
  ExplainParametersSchema, IndexParametersSchema, RestoreParametersSchema,
]);
export const AgentDatabaseOperationDispatchSchema = z.object({
  operationId: z.string().uuid(), version: z.number().int().positive(),
  kind: DatabaseOperationKindSchema, parameters: AgentDatabaseOperationParametersSchema,
  idempotencyKey: z.string().min(8).max(160).regex(/^[A-Za-z0-9._:-]+$/),
  expiresAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  if (value.kind !== value.parameters.kind) context.addIssue({ code: "custom", path: ["parameters", "kind"], message: "operation kind must match parameters" });
});
export const AgentDatabaseOperationPollRequestSchema = z.object({ limit: z.number().int().min(1).max(10).default(4) }).strict();
export const AgentDatabaseOperationPollResponseSchema = z.object({
  operations: z.array(AgentDatabaseOperationDispatchSchema).max(10), controllerTime: z.string().datetime(),
}).strict();
export const AgentDatabaseOperationStatusResponseSchema = z.object({ acceptedAt: z.string().datetime() }).strict();

export const DatabaseHelperRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("collect") }).strict(),
  z.object({ action: z.literal("execute"), operation: AgentDatabaseOperationDispatchSchema }).strict(),
]);
export const DatabaseHelperCollectionSchema = z.object({
  snapshot: AgentDatabaseSnapshotSchema, queryUpload: AgentDatabaseQueryUploadSchema,
}).strict();
export const DatabaseHelperResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), result: z.union([DatabaseHelperCollectionSchema, AgentDatabaseOperationUpdateSchema]) }).strict(),
  z.object({ ok: z.literal(false), code: z.string().min(1).max(100), error: z.string().min(1).max(500) }).strict(),
]);

export type AgentDatabaseOperationParameters = z.infer<typeof AgentDatabaseOperationParametersSchema>;
export type AgentDatabaseOperationDispatch = z.infer<typeof AgentDatabaseOperationDispatchSchema>;
export type AgentDatabaseOperationUpdate = z.infer<typeof AgentDatabaseOperationUpdateSchema>;
export type DatabaseHelperRequest = z.infer<typeof DatabaseHelperRequestSchema>;
export type DatabaseHelperResponse = z.infer<typeof DatabaseHelperResponseSchema>;
