import { z } from "zod";

export const SiteRuntimeStatusSchema = z.enum(["running", "warning", "stopped", "unknown"]);

export const SiteRuntimeRecordSchema = z.object({
  id: z.string().min(1).max(160),
  domain: z.string().min(1).max(253),
  status: SiteRuntimeStatusSchema,
  runtime: z.string().min(1).max(128),
  host: z.string().min(1).max(253),
  upstream: z.string().max(512).nullable(),
  source: z.string().min(1).max(128),
  latencyMs: z.number().int().nonnegative().nullable(),
  certificateExpiresAt: z.string().datetime().nullable(),
  certificateIssuer: z.string().min(1).max(253).nullable(),
  trafficBytes: z.number().int().nonnegative().safe().nullable(),
}).strict();

export const SiteRuntimePayloadSchema = z.object({
  collectedAt: z.string().datetime(),
  collectionStatus: z.enum(["complete", "partial", "unavailable"]),
  warnings: z.array(z.string().min(1).max(256)).max(20),
  sites: z.array(SiteRuntimeRecordSchema).max(10_000),
}).strict();

export type SiteRuntimeStatus = z.infer<typeof SiteRuntimeStatusSchema>;
export type SiteRuntimeRecord = z.infer<typeof SiteRuntimeRecordSchema>;
export type SiteRuntimePayload = z.infer<typeof SiteRuntimePayloadSchema>;
