import { z } from "zod";

export const AuditExportFormatSchema = z.enum(["csv", "json"]);
export const CreateAuditExportRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  format: AuditExportFormatSchema,
}).strict();

export const AuditExportRecordSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  format: AuditExportFormatSchema,
  status: z.enum(["ready", "failed"]),
  rowCount: z.number().int().nonnegative(),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime(),
  traceId: z.string().uuid(),
  errorCode: z.string().nullable(),
}).strict();

export const AuditExportListResponseSchema = z.object({
  exports: z.array(AuditExportRecordSchema).max(200),
  collectedAt: z.string().datetime(),
}).strict();

export const AuditExportCreateResponseSchema = z.object({ export: AuditExportRecordSchema }).strict();

export type AuditExportFormat = z.infer<typeof AuditExportFormatSchema>;
export type AuditExportRecord = z.infer<typeof AuditExportRecordSchema>;
export type CreateAuditExportRequest = z.infer<typeof CreateAuditExportRequestSchema>;

export const AUDIT_FAILURE_OUTCOMES = [
  "failure", "failed", "error", "denied", "rejected", "cancelled", "canceled", "expired",
  "timeout", "timed_out", "unauthorized", "forbidden", "aborted", "interrupted", "blocked",
] as const;

export const AUDIT_SUCCESS_OUTCOMES = ["success", "succeeded", "completed"] as const;

export const AuditEventSchema = z.object({
  sequence: z.number().int().positive(),
  eventId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  actorType: z.string().min(1).max(64),
  actorId: z.string().max(256).nullable(),
  source: z.string().min(1).max(512),
  targetType: z.string().max(128).nullable(),
  targetId: z.string().max(2_048).nullable(),
  action: z.string().min(1).max(256),
  parameters: z.string().max(16_384),
  outcome: z.string().min(1).max(128),
  authorization: z.string().min(1).max(4_096),
  requestId: z.string().min(1).max(256),
  traceId: z.string().min(1).max(256),
  eventHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

const trimmedQuery = (max: number) => z.preprocess(
  (value) => typeof value === "string" ? value.trim() : value,
  z.string().min(1).max(max).optional(),
);

export const AuditEventsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(1_000).optional(),
  beforeSequence: z.coerce.number().int().positive().optional(),
  result: z.enum(["success", "failure"]).optional(),
  actionPrefix: trimmedQuery(120),
  actor: trimmedQuery(256),
  source: trimmedQuery(512),
  search: trimmedQuery(512),
}).strict();

export const AuditEventsResponseSchema = z.object({
  events: z.array(AuditEventSchema).max(1_000),
  collectedAt: z.string().datetime(),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive().max(1_000),
  nextCursor: z.number().int().positive().nullable(),
}).strict();

export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type AuditEventsQuery = z.infer<typeof AuditEventsQuerySchema>;
export type AuditEventsResponse = z.infer<typeof AuditEventsResponseSchema>;
