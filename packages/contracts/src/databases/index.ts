import { z } from "zod";

const nullableDateTime = z.string().datetime().nullable();
const nullableBytes = z.number().int().nonnegative().safe().nullable();

export const DatabaseEngineSchema = z.enum(["postgresql", "mysql", "mariadb"]);
export const DatabaseRuntimeStatusSchema = z.enum(["running", "degraded", "stopped", "unknown"]);
export const DatabaseCollectionStatusSchema = z.enum(["complete", "partial", "unavailable"]);
export const DatabaseFreshnessSchema = z.enum(["current", "stale"]);
export const DatabaseAccessModeSchema = z.enum(["read-write", "read-only", "backup-only", "unknown"]);
export const DatabaseBackupStatusSchema = z.enum(["succeeded", "failed", "running", "pending", "unavailable"]);

export const AgentDatabaseInstanceSchema = z.object({
  id: z.string().min(1).max(200), name: z.string().min(1).max(200), engine: DatabaseEngineSchema,
  version: z.string().min(1).max(80).nullable(), host: z.string().min(1).max(253), port: z.number().int().min(1).max(65_535).nullable(),
  status: DatabaseRuntimeStatusSchema, source: z.string().min(1).max(256), latencyMs: z.number().int().nonnegative().nullable(),
  storageBytes: nullableBytes, activeConnections: z.number().int().nonnegative().nullable(), maxConnections: z.number().int().positive().nullable(),
  slowQueryCount: z.number().int().nonnegative().nullable(), backupStatus: DatabaseBackupStatusSchema, lastBackupAt: nullableDateTime,
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
  id: z.string().regex(/^database-[a-f0-9]{32}$/), nodeId: z.string().uuid(), nodeName: z.string().min(1).max(200),
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
