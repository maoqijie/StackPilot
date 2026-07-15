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
