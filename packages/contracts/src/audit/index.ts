import { z } from "zod";

export const AuditEventSchema = z.object({
  sequence: z.number().int().positive(),
  eventId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  actorType: z.string().min(1),
  actorId: z.string().nullable(),
  source: z.string().min(1),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  action: z.string().min(1),
  parameters: z.string(),
  outcome: z.string().min(1),
  requestId: z.string().min(1),
  traceId: z.string().min(1),
}).strict();

export const AuditEventsResponseSchema = z.object({
  events: z.array(AuditEventSchema).max(1_000),
  collectedAt: z.string().datetime(),
}).strict();

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

export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type AuditExportFormat = z.infer<typeof AuditExportFormatSchema>;
export type AuditExportRecord = z.infer<typeof AuditExportRecordSchema>;
export type CreateAuditExportRequest = z.infer<typeof CreateAuditExportRequestSchema>;
