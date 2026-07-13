import { z } from "zod";
import {
  DatabaseAccessModeSchema, DatabaseCollectionEnvelopeSchema, DatabaseEngineSchema, DatabaseFreshnessSchema,
  DatabaseIdSchema, DatabaseInstanceBackupStatusSchema, DatabaseRuntimeStatusSchema,
} from "./common.js";

const nullableBytes = z.number().int().nonnegative().safe().nullable();
export const DatabaseVolumeSchema = z.object({
  label: z.string().min(1).max(200), path: z.string().min(1).max(1_024), totalBytes: z.number().int().nonnegative().safe(),
  usedBytes: z.number().int().nonnegative().safe(),
}).strict().refine((value) => value.usedBytes <= value.totalBytes, { message: "usedBytes must not exceed totalBytes" });
export const AgentDatabaseInstanceSchema = z.object({
  id: z.string().min(1).max(200), name: z.string().min(1).max(200), engine: DatabaseEngineSchema,
  version: z.string().min(1).max(80).nullable(), host: z.string().min(1).max(253), port: z.number().int().min(1).max(65_535).nullable(),
  status: DatabaseRuntimeStatusSchema, source: z.string().min(1).max(256), managed: z.boolean(), historicalSlowQueriesAvailable: z.boolean(),
  latencyMs: z.number().int().nonnegative().safe().nullable(), storageBytes: nullableBytes,
  activeConnections: z.number().int().nonnegative().safe().nullable(), maxConnections: z.number().int().positive().safe().nullable(),
  slowQueryCount: z.number().int().nonnegative().safe().nullable(), backupStatus: DatabaseInstanceBackupStatusSchema,
  lastBackupAt: z.string().datetime().nullable(), accessMode: DatabaseAccessModeSchema,
  owner: z.string().min(1).max(120).nullable(), region: z.string().min(1).max(120).nullable(),
  autoBackup: z.boolean().nullable(), remoteAccess: z.boolean().nullable(), volumes: z.array(DatabaseVolumeSchema).max(256),
}).strict();
export const AgentDatabaseSnapshotSchema = DatabaseCollectionEnvelopeSchema.extend({
  instances: z.array(AgentDatabaseInstanceSchema).max(256),
}).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  value.instances.forEach((instance, index) => {
    if (ids.has(instance.id)) context.addIssue({ code: "custom", path: ["instances", index, "id"], message: "database instance ids must be unique" });
    ids.add(instance.id);
  });
});
export const DatabaseInstanceRecordSchema = AgentDatabaseInstanceSchema.extend({
  id: DatabaseIdSchema, localId: z.string().min(1).max(200), nodeId: z.string().uuid(), nodeName: z.string().min(1).max(200),
  address: z.union([z.ipv4(), z.ipv6()]).nullable(), collectedAt: z.string().datetime(), freshness: DatabaseFreshnessSchema,
}).strict();
export const DatabaseInstancesPayloadSchema = DatabaseCollectionEnvelopeSchema.extend({
  instances: z.array(DatabaseInstanceRecordSchema).max(10_000),
}).strict();

export type AgentDatabaseInstance = z.infer<typeof AgentDatabaseInstanceSchema>;
export type AgentDatabaseSnapshot = z.infer<typeof AgentDatabaseSnapshotSchema>;
export type DatabaseInstanceRecord = z.infer<typeof DatabaseInstanceRecordSchema>;
export type DatabaseInstancesPayload = z.infer<typeof DatabaseInstancesPayloadSchema>;
