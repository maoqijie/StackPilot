import { z } from "zod";

export const DatabaseIdSchema = z.string().regex(/^database-[a-f0-9]{32}$/);
export const DatabaseEngineSchema = z.enum(["postgresql", "mysql", "mariadb"]);
export const DatabaseRuntimeStatusSchema = z.enum(["running", "degraded", "stopped", "unknown"]);
export const DatabaseCollectionStatusSchema = z.enum(["complete", "partial", "unavailable"]);
export const DatabaseFreshnessSchema = z.enum(["current", "stale"]);
export const DatabaseAccessModeSchema = z.enum(["read-write", "read-only", "backup-only", "unknown"]);
export const DatabaseInstanceBackupStatusSchema = z.enum(["succeeded", "failed", "running", "pending", "unavailable"]);
export const DatabaseOperationStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "cancelled"]);
export const DatabaseRiskSchema = z.enum(["high", "medium", "low"]);
export const DatabaseIdempotencyKeySchema = z.string().trim().min(8).max(100).regex(/^[A-Za-z0-9._:-]+$/);
export const DatabaseCollectionEnvelopeSchema = z.object({
  collectedAt: z.string().datetime(),
  collectionStatus: DatabaseCollectionStatusSchema,
  warnings: z.array(z.string().min(1).max(256)).max(20),
}).strict();
export const DatabaseQueryRangeSchema = z.enum(["24h", "7d"]);

export type DatabaseEngine = z.infer<typeof DatabaseEngineSchema>;
export type DatabaseOperationStatus = z.infer<typeof DatabaseOperationStatusSchema>;
