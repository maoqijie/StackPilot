import { z } from "zod";
import { DatabaseCollectionEnvelopeSchema, DatabaseIdSchema, DatabaseIdempotencyKeySchema, DatabaseQueryRangeSchema, DatabaseRiskSchema } from "./common.js";
import { DatabaseInstanceRecordSchema } from "./inventory.js";

export const DatabaseSessionSchema = z.object({
  id: z.string().min(1).max(160), instanceId: DatabaseIdSchema, database: z.string().min(1).max(128).nullable(),
  username: z.string().min(1).max(128).nullable(), applicationName: z.string().min(1).max(160).nullable(),
  clientAddress: z.union([z.ipv4(), z.ipv6()]).nullable(), state: z.enum(["active", "idle", "waiting", "unknown"]),
  startedAt: z.string().datetime().nullable(), transactionStartedAt: z.string().datetime().nullable(),
  protected: z.boolean(), protectedReason: z.string().min(1).max(200).nullable(),
}).strict();
export const AgentDatabaseSessionSchema = DatabaseSessionSchema.omit({ instanceId: true }).extend({ instanceLocalId: z.string().min(1).max(200) }).strict();
export const DatabaseSlowQueryMetadataSchema = z.object({
  id: z.string().min(1).max(160), instanceId: z.string().min(1).max(160), database: z.string().min(1).max(128), fingerprint: z.string().min(1).max(160),
  durationMs: z.number().int().nonnegative().safe(), calls: z.number().int().nonnegative().safe().nullable(),
  p95Ms: z.number().int().nonnegative().safe().nullable(), rowsExamined: z.number().int().nonnegative().safe().nullable(),
  risk: DatabaseRiskSchema, state: z.enum(["active", "waiting", "resolved"]), owner: z.string().min(1).max(128).nullable(),
  startedAt: z.string().datetime(), lastSeenAt: z.string().datetime(), sessionId: z.string().min(1).max(160).nullable(),
  waitEvent: z.string().min(1).max(160).nullable(), resolvedAt: z.string().datetime().nullable().optional(), historical: z.boolean().optional(),
}).strict();
export const DatabaseSlowQueryRecordSchema = DatabaseSlowQueryMetadataSchema.extend({ sql: z.string().min(1).max(2_000).nullable() }).strict();
export const AgentDatabaseSlowQuerySchema = DatabaseSlowQueryMetadataSchema.omit({ instanceId: true, resolvedAt: true }).extend({
  instanceLocalId: z.string().min(1).max(200), sql: z.string().min(1).max(2_000),
}).strict();
export const AgentDatabaseQueryUploadSchema = DatabaseCollectionEnvelopeSchema.extend({
  sessions: z.array(AgentDatabaseSessionSchema).max(10_000), queries: z.array(AgentDatabaseSlowQuerySchema).max(10_000),
}).strict();
export const DatabaseInstanceDetailSchema = z.object({
  instance: DatabaseInstanceRecordSchema, sessions: z.array(DatabaseSessionSchema).max(10_000),
  recentQueries: z.array(DatabaseSlowQueryRecordSchema).max(1_000),
}).strict();
export const DatabaseSlowQueryInstanceSchema = z.object({
  id: z.string().min(1).max(160), name: z.string().min(1).max(200), engine: z.string().min(1).max(128), host: z.string().min(1).max(253),
  port: z.number().int().min(1).max(65_535).nullable(), activeConnections: z.number().int().nonnegative().safe().nullable(),
  slowQueryCount: z.number().int().nonnegative().safe().nullable(), collectedAt: z.string().datetime(), historicalSlowQueriesAvailable: z.boolean().optional(),
}).strict();
export const DatabaseSlowQueriesPayloadSchema = DatabaseCollectionEnvelopeSchema.extend({
  range: DatabaseQueryRangeSchema.optional(), thresholdMs: z.number().int().positive().safe(),
  instances: z.array(DatabaseSlowQueryInstanceSchema).max(10_000), queries: z.array(DatabaseSlowQueryRecordSchema).max(10_000),
}).strict();
export const ExplainDatabaseQueryRequestSchema = z.object({ idempotencyKey: DatabaseIdempotencyKeySchema }).strict();
export const ResolveDatabaseQueryRequestSchema = z.object({ resolution: z.string().trim().min(1).max(500) }).strict();
export const DatabaseSlowQueryResponseSchema = z.object({ query: DatabaseSlowQueryRecordSchema }).strict();
export const AgentDatabaseUploadResponseSchema = z.object({ acceptedAt: z.string().datetime() }).strict();

export type AgentDatabaseQueryUpload = z.infer<typeof AgentDatabaseQueryUploadSchema>;
export type DatabaseSession = z.infer<typeof DatabaseSessionSchema>;
export type DatabaseSlowQueryRecord = z.infer<typeof DatabaseSlowQueryRecordSchema>;
export type DatabaseSlowQueryInstance = z.infer<typeof DatabaseSlowQueryInstanceSchema>;
export type DatabaseInstanceDetail = z.infer<typeof DatabaseInstanceDetailSchema>;
export type DatabaseSlowQueriesPayload = z.infer<typeof DatabaseSlowQueriesPayloadSchema>;
