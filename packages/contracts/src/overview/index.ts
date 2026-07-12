import { z } from "zod";
import { ApiNoticeSchema } from "../common/index.js";
import { OverviewRiskRecordSchema } from "../risks/index.js";
import { OverviewMetricIconSchema, OverviewTaskPageDataSchema, OverviewTaskRecordSchema } from "../tasks/index.js";

export const OverviewServiceSchema = z.object({
  id: z.string(), name: z.string(), target: z.string(), status: z.enum(["健康", "警告", "离线"]),
  detail: z.string(), latencyMs: z.number().optional(),
  process: z.object({ pid: z.number(), command: z.string() }).optional(),
});
export const OverviewNodeSchema = z.object({
  id: z.string(), name: z.string(), ip: z.string(), env: z.string(), status: z.enum(["健康", "警告", "维护", "离线"]),
  source: z.enum(["controller", "agent"]).default("controller"),
  collectedAt: z.string().datetime().nullable().default(null),
  freshness: z.enum(["current", "stale", "awaiting"]).default("current"),
  availability: z.object({
    cpu: z.boolean(), memory: z.boolean(), disk: z.boolean(), latency: z.boolean(),
    backup: z.boolean(), update: z.boolean(), services: z.boolean(),
  }).default({ cpu: true, memory: true, disk: true, latency: true, backup: true, update: true, services: true }),
  latency: z.string(), latencyStatus: z.enum(["健康", "警告"]), cpu: z.string(), memory: z.string(), disk: z.string(),
  version: z.string(), uptime: z.string(), backup: z.string(), backupStatus: z.enum(["健康", "警告"]),
  update: z.string(), owner: z.string(), services: z.array(OverviewServiceSchema),
  diskVolumes: z.array(z.object({
    label: z.string(), mount: z.string(), totalBytes: z.number().nonnegative(), usedBytes: z.number().nonnegative(), percent: z.number().min(0).max(100),
  })).optional(),
});
export const OverviewAuditRowSchema = z.tuple([z.string(), z.string(), z.string(), z.string(), z.string(), z.enum(["成功", "失败"]), z.string()]);
export const OverviewResourceRecordSchema = z.object({
  label: z.string(), value: z.string(), delta: z.string(), values: z.array(z.number()),
  collectedAt: z.string().datetime().nullable(), freshness: z.enum(["current", "stale", "awaiting"]),
});
export const OverviewClusterSchema = z.object({
  current: z.string(), health: z.enum(["健康", "警告", "维护"]), latency: z.string(), version: z.string(),
  uptime: z.string(), lastBackup: z.string(), pendingUpdates: z.number(),
});
export const OverviewMetricDataSchema = z.object({
  label: z.string(), value: z.string(), suffix: z.string(), delta: z.string(), icon: OverviewMetricIconSchema,
  tone: z.string(), line: z.array(z.number()),
  details: z.array(z.object({ label: z.string(), value: z.string(), detail: z.string() })).optional(),
});
export const OverviewSummaryPayloadSchema = z.object({
  cluster: OverviewClusterSchema, metrics: z.array(OverviewMetricDataSchema), nodes: z.array(OverviewNodeSchema),
  tasks: z.array(OverviewTaskRecordSchema), taskPage: OverviewTaskPageDataSchema, audits: z.array(OverviewAuditRowSchema),
  risks: z.array(OverviewRiskRecordSchema), resources: z.record(z.string(), z.array(OverviewResourceRecordSchema)),
  collectedAt: z.string().datetime(), lastRefresh: z.string(),
});
export const OverviewHealthPayloadSchema = z.object({ nodes: z.array(OverviewNodeSchema), collectedAt: z.string().datetime(), lastRefresh: z.string() });
export const OverviewCheckUpdatesResponseSchema = ApiNoticeSchema.extend({ overview: OverviewSummaryPayloadSchema });
export const OverviewHealthRefreshResponseSchema = ApiNoticeSchema.extend(OverviewHealthPayloadSchema.shape);
export const OverviewNodeMutationResponseSchema = ApiNoticeSchema.extend({ node: OverviewNodeSchema });

export type OverviewService = z.infer<typeof OverviewServiceSchema>;
export type OverviewNode = z.infer<typeof OverviewNodeSchema>;
export type OverviewAuditRow = z.infer<typeof OverviewAuditRowSchema>;
export type OverviewResourceRecord = z.infer<typeof OverviewResourceRecordSchema>;
export type OverviewCluster = z.infer<typeof OverviewClusterSchema>;
export type OverviewMetricData = z.infer<typeof OverviewMetricDataSchema>;
export type OverviewSummaryPayload = z.infer<typeof OverviewSummaryPayloadSchema>;
export type OverviewHealthPayload = z.infer<typeof OverviewHealthPayloadSchema>;
export type OverviewCheckUpdatesResponse = z.infer<typeof OverviewCheckUpdatesResponseSchema>;
export type OverviewHealthRefreshResponse = z.infer<typeof OverviewHealthRefreshResponseSchema>;
export type OverviewNodeMutationResponse = z.infer<typeof OverviewNodeMutationResponseSchema>;
