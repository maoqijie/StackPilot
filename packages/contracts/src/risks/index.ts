import { z } from "zod";
import { ApiNoticeSchema } from "../common/index.js";

export const OverviewRiskEvidenceSchema = z.object({ label: z.string(), value: z.string() });
export const OverviewRiskRecordSchema = z.object({
  id: z.string(), title: z.string(), level: z.enum(["高危", "中危", "低危"]),
  status: z.literal("待处理"), target: z.string(), owner: z.string(), impact: z.string(),
  detected: z.string(), suggestion: z.string(), evidence: z.array(OverviewRiskEvidenceSchema).optional(),
  traceId: z.string(),
});
export const OverviewRisksPayloadSchema = z.object({
  risks: z.array(OverviewRiskRecordSchema),
  scannedAt: z.string().optional(),
});
export const OverviewRisksScanResponseSchema = ApiNoticeSchema.extend(OverviewRisksPayloadSchema.shape);

export type OverviewRiskEvidence = z.infer<typeof OverviewRiskEvidenceSchema>;
export type OverviewRiskRecord = z.infer<typeof OverviewRiskRecordSchema>;
export type OverviewRisksPayload = z.infer<typeof OverviewRisksPayloadSchema>;
export type OverviewRisksScanResponse = z.infer<typeof OverviewRisksScanResponseSchema>;
