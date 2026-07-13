import { z } from "zod";

export const DatabaseBackupSourceSchema = z.object({
  id: z.literal("controller-sqlite"),
  name: z.string().min(1),
  engine: z.literal("SQLite"),
  schemaVersion: z.number().int().positive(),
  sizeBytes: z.number().int().nonnegative(),
  target: z.string().min(1),
});

export const DatabaseBackupRecordSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  fileName: z.string().min(1).max(255),
  storage: z.string().min(1),
  createdAt: z.string().datetime(),
  sizeBytes: z.number().int().nonnegative(),
  checksumStatus: z.enum(["pending", "verified"]),
  drillStatus: z.enum(["not_started", "succeeded"]),
  drilledAt: z.string().datetime().nullable(),
});

export const DatabaseBackupsPayloadSchema = z.object({
  collectedAt: z.string().datetime(),
  source: DatabaseBackupSourceSchema,
  backups: z.array(DatabaseBackupRecordSchema),
  warnings: z.array(z.string()),
});

export const CreateDatabaseBackupRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(100).regex(/^[A-Za-z0-9._:-]+$/),
}).strict();

export const DatabaseBackupMutationResponseSchema = z.object({
  backup: DatabaseBackupRecordSchema,
  message: z.string().min(1),
  tone: z.enum(["success", "info", "warning", "danger"]),
});

export type DatabaseBackupSource = z.infer<typeof DatabaseBackupSourceSchema>;
export type DatabaseBackupRecord = z.infer<typeof DatabaseBackupRecordSchema>;
export type DatabaseBackupsPayload = z.infer<typeof DatabaseBackupsPayloadSchema>;
export type CreateDatabaseBackupRequest = z.infer<typeof CreateDatabaseBackupRequestSchema>;
export type DatabaseBackupMutationResponse = z.infer<typeof DatabaseBackupMutationResponseSchema>;

const nullableDateTime = z.string().datetime().nullable();
const nullableBytes = z.number().int().nonnegative().safe().nullable();

export const DatabaseEngineSchema = z.enum(["postgresql", "mysql", "mariadb"]);
export const DatabaseRuntimeStatusSchema = z.enum(["running", "degraded", "stopped", "unknown"]);
export const DatabaseCollectionStatusSchema = z.enum(["complete", "partial", "unavailable"]);
export const DatabaseFreshnessSchema = z.enum(["current", "stale"]);
export const DatabaseAccessModeSchema = z.enum(["read-write", "read-only", "backup-only", "unknown"]);
export const DatabaseInstanceBackupStatusSchema = z.enum(["succeeded", "failed", "running", "pending", "unavailable"]);

export const AgentDatabaseInstanceSchema = z.object({
  id: z.string().min(1).max(200), name: z.string().min(1).max(200), engine: DatabaseEngineSchema,
  version: z.string().min(1).max(80).nullable(), host: z.string().min(1).max(253), port: z.number().int().min(1).max(65_535).nullable(),
  status: DatabaseRuntimeStatusSchema, source: z.string().min(1).max(256), latencyMs: z.number().int().nonnegative().nullable(),
  storageBytes: nullableBytes, activeConnections: z.number().int().nonnegative().nullable(), maxConnections: z.number().int().positive().nullable(),
  slowQueryCount: z.number().int().nonnegative().nullable(), backupStatus: DatabaseInstanceBackupStatusSchema, lastBackupAt: nullableDateTime,
  accessMode: DatabaseAccessModeSchema, owner: z.string().min(1).max(120).nullable(), region: z.string().min(1).max(120).nullable(),
  autoBackup: z.boolean().nullable(), remoteAccess: z.boolean().nullable(),
}).strict();

export const AgentDatabaseSnapshotSchema = z.object({
  collectedAt: z.string().datetime(), collectionStatus: DatabaseCollectionStatusSchema,
  warnings: z.array(z.string().min(1).max(256)).max(20), instances: z.array(AgentDatabaseInstanceSchema).max(256),
}).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  value.instances.forEach((instance, index) => {
    if (ids.has(instance.id)) context.addIssue({ code: "custom", path: ["instances", index, "id"], message: "database instance ids must be unique" });
    ids.add(instance.id);
  });
});

export const DatabaseInstanceRecordSchema = AgentDatabaseInstanceSchema.extend({
  id: z.string().regex(/^database-[a-f0-9]{32}$/), nodeId: z.string().min(1).max(160), nodeName: z.string().min(1).max(200),
  address: z.union([z.ipv4(), z.ipv6()]).nullable(), collectedAt: z.string().datetime(), freshness: DatabaseFreshnessSchema,
}).strict();

export const DatabaseInstancesPayloadSchema = z.object({
  collectedAt: z.string().datetime(), collectionStatus: DatabaseCollectionStatusSchema,
  warnings: z.array(z.string().min(1).max(256)).max(20), instances: z.array(DatabaseInstanceRecordSchema).max(10_000),
}).strict();

export type AgentDatabaseInstance = z.infer<typeof AgentDatabaseInstanceSchema>;
export type AgentDatabaseSnapshot = z.infer<typeof AgentDatabaseSnapshotSchema>;
export type DatabaseInstanceRecord = z.infer<typeof DatabaseInstanceRecordSchema>;
export type DatabaseInstancesPayload = z.infer<typeof DatabaseInstancesPayloadSchema>;

export const DatabaseSlowQueryRecordSchema = z.object({
  id: z.string().min(1).max(160), instanceId: z.string().min(1).max(160), database: z.string().min(1).max(128),
  fingerprint: z.string().min(1).max(160), sql: z.string().min(1).max(2_000), durationMs: z.number().int().nonnegative().safe(),
  calls: z.number().int().nonnegative().safe().nullable(), p95Ms: z.number().int().nonnegative().safe().nullable(),
  rowsExamined: z.number().int().nonnegative().safe().nullable(), risk: z.enum(["high", "medium", "low"]),
  state: z.enum(["active", "waiting"]), owner: z.string().min(1).max(128).nullable(), startedAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(), sessionId: z.string().min(1).max(80).nullable(), waitEvent: z.string().min(1).max(160).nullable(),
}).strict();

export const DatabaseSlowQueryInstanceSchema = z.object({
  id: z.string().min(1).max(160), name: z.string().min(1).max(128), engine: z.string().min(1).max(128),
  host: z.string().min(1).max(253), port: z.number().int().min(1).max(65_535),
  activeConnections: z.number().int().nonnegative().safe(), slowQueryCount: z.number().int().nonnegative().safe(), collectedAt: z.string().datetime(),
}).strict();

export const DatabaseSlowQueriesPayloadSchema = z.object({
  collectedAt: z.string().datetime(), collectionStatus: z.enum(["complete", "partial", "unavailable"]),
  warnings: z.array(z.string().min(1).max(256)).max(20), thresholdMs: z.number().int().positive().safe(),
  instances: z.array(DatabaseSlowQueryInstanceSchema).max(10_000), queries: z.array(DatabaseSlowQueryRecordSchema).max(10_000),
}).strict();

export type DatabaseSlowQueryRecord = z.infer<typeof DatabaseSlowQueryRecordSchema>;
export type DatabaseSlowQueryInstance = z.infer<typeof DatabaseSlowQueryInstanceSchema>;
export type DatabaseSlowQueriesPayload = z.infer<typeof DatabaseSlowQueriesPayloadSchema>;
