import { z } from "zod";
import {
  AgentDatabaseOperationUpdateSchema, AgentDatabaseQueryUploadSchema, AgentDatabaseSnapshotSchema,
  DatabaseBackupCronSchema, DatabaseBackupOperationResultSchema, DatabaseEngineSchema, DatabaseOperationKindSchema,
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

export const AgentDatabaseBackupPlanSchema = z.object({
  id: z.string().uuid(), instanceLocalId: LocalIdSchema, cron: DatabaseBackupCronSchema,
  retentionCount: z.number().int().min(1).max(30), enabled: z.boolean(),
  version: z.number().int().positive(), updatedAt: z.string().datetime(),
}).strict();
const AgentDatabaseBackupPlansSchema = z.array(AgentDatabaseBackupPlanSchema).max(1_000).superRefine((plans, context) => {
  const ids = new Set<string>(); plans.forEach((plan, index) => { if (ids.has(plan.id)) context.addIssue({ code: "custom", path: [index, "id"], message: "backup plan ids must be unique" }); ids.add(plan.id); });
});
export const AgentDatabaseBackupPlanPollRequestSchema = z.object({}).strict();
export const AgentDatabaseBackupPlanPollResponseSchema = z.object({
  plans: AgentDatabaseBackupPlansSchema, controllerTime: z.string().datetime(),
}).strict();
export const AgentDatabaseScheduledBackupReportSchema = z.object({
  reportId: z.string().uuid(), planId: z.string().uuid(), planVersion: z.number().int().positive(),
  instanceLocalId: LocalIdSchema, scheduledFor: z.string().datetime(), status: z.enum(["succeeded", "failed"]),
  result: DatabaseBackupOperationResultSchema.nullable(), errorCode: z.string().min(1).max(100).nullable(),
  completedAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  if (value.status === "succeeded" && !value.result) context.addIssue({ code: "custom", path: ["result"], message: "successful scheduled backup requires a result" });
  if (value.status === "failed" && !value.errorCode) context.addIssue({ code: "custom", path: ["errorCode"], message: "failed scheduled backup requires an error code" });
  if (value.status === "failed" && value.result) context.addIssue({ code: "custom", path: ["result"], message: "failed scheduled backup cannot include a result" });
});
export const AgentDatabaseScheduledBackupResultsRequestSchema = z.object({
  reports: z.array(AgentDatabaseScheduledBackupReportSchema).min(1).max(100),
}).strict().superRefine((value, context) => {
  const ids = new Set<string>(); value.reports.forEach((report, index) => { if (ids.has(report.reportId)) context.addIssue({ code: "custom", path: ["reports", index, "reportId"], message: "scheduled backup report ids must be unique" }); ids.add(report.reportId); });
});
export const AgentDatabaseScheduledBackupResultsResponseSchema = z.object({
  acceptedReportIds: z.array(z.string().uuid()).max(100), acceptedAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  const ids = new Set<string>(); value.acceptedReportIds.forEach((id, index) => { if (ids.has(id)) context.addIssue({ code: "custom", path: ["acceptedReportIds", index], message: "accepted report ids must be unique" }); ids.add(id); });
});

export const DatabaseHelperBackupPlansResponseSchema = z.object({ plans: AgentDatabaseBackupPlansSchema }).strict();
export const DatabaseHelperBackupResultsResponseSchema = z.object({ reports: z.array(AgentDatabaseScheduledBackupReportSchema).max(100) }).strict();
export const DatabaseHelperBackupResultAckSchema = z.object({ acknowledgedReportIds: z.array(z.string().uuid()).max(100) }).strict();

export const DatabaseHelperRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("collect") }).strict(),
  z.object({ action: z.literal("execute"), operation: AgentDatabaseOperationDispatchSchema }).strict(),
  z.object({ action: z.literal("replace-backup-plans"), plans: AgentDatabaseBackupPlansSchema }).strict(),
  z.object({ action: z.literal("list-backup-results"), limit: z.number().int().min(1).max(100) }).strict(),
  z.object({ action: z.literal("ack-backup-results"), reportIds: z.array(z.string().uuid()).min(1).max(100) }).strict(),
]);
export const DatabaseHelperCollectionSchema = z.object({
  snapshot: AgentDatabaseSnapshotSchema, queryUpload: AgentDatabaseQueryUploadSchema,
}).strict();
export const DatabaseHelperResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), result: z.union([
    DatabaseHelperCollectionSchema, AgentDatabaseOperationUpdateSchema, DatabaseHelperBackupPlansResponseSchema,
    DatabaseHelperBackupResultsResponseSchema, DatabaseHelperBackupResultAckSchema,
  ]) }).strict(),
  z.object({ ok: z.literal(false), code: z.string().min(1).max(100), error: z.string().min(1).max(500) }).strict(),
]);

export type AgentDatabaseOperationParameters = z.infer<typeof AgentDatabaseOperationParametersSchema>;
export type AgentDatabaseOperationDispatch = z.infer<typeof AgentDatabaseOperationDispatchSchema>;
export type AgentDatabaseOperationUpdate = z.infer<typeof AgentDatabaseOperationUpdateSchema>;
export type AgentDatabaseBackupPlan = z.infer<typeof AgentDatabaseBackupPlanSchema>;
export type AgentDatabaseScheduledBackupReport = z.infer<typeof AgentDatabaseScheduledBackupReportSchema>;
export type DatabaseHelperRequest = z.infer<typeof DatabaseHelperRequestSchema>;
export type DatabaseHelperResponse = z.infer<typeof DatabaseHelperResponseSchema>;
