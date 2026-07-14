import { z } from "zod";
import { AgentCapabilitySchema } from "../agent/capabilities.js";

const OpaqueIdSchema = z.string().min(8).max(160).regex(/^[A-Za-z0-9:_-]+$/);
const nullableDateTime = z.string().datetime().nullable();

export const SiteRuntimeStatusSchema = z.enum(["running", "warning", "stopped", "unknown"]);
export const SiteCollectionStatusSchema = z.enum(["complete", "partial", "unavailable"]);
export const SiteFreshnessSchema = z.enum(["current", "stale", "awaiting"]);
export const CertificateStatusSchema = z.enum(["valid", "expiring", "critical", "expired", "unavailable"]);
export const CertificateRenewalModeSchema = z.enum(["automatic", "manual", "unsupported"]);
export const CertificateRenewalStatusSchema = z.enum(["idle", "queued", "running", "succeeded", "failed", "cancelled", "expired"]);

export const SiteCertificateSchema = z.object({
  status: CertificateStatusSchema,
  notBefore: nullableDateTime,
  expiresAt: nullableDateTime,
  issuer: z.string().min(1).max(253).nullable(),
  subjectAlternativeNames: z.array(z.string().min(1).max(253)).max(100),
  fingerprintSha256: z.string().regex(/^[A-F0-9]{64}$/).nullable(),
  renewalMode: CertificateRenewalModeSchema,
  renewable: z.boolean(),
  unavailableReason: z.string().min(1).max(256).nullable(),
  certificateId: OpaqueIdSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.renewable && !value.certificateId) {
    context.addIssue({ code: "custom", path: ["certificateId"], message: "renewable certificates require certificateId" });
  }
  if (value.status !== "unavailable" && !value.expiresAt) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "available certificates require expiresAt" });
  }
});

export const CertificateHelperStatusDataSchema = z.object({
  certificates: z.array(z.object({
    sourceId: OpaqueIdSchema,
    certificate: SiteCertificateSchema,
  }).strict()).max(200),
}).strict();

const AgentSiteSnapshotRecordBaseSchema = z.object({
  id: OpaqueIdSchema,
  domain: z.string().min(1).max(253),
  status: SiteRuntimeStatusSchema,
  runtime: z.string().min(1).max(128),
  host: z.string().min(1).max(253),
  upstream: z.string().max(512).nullable(),
  source: z.string().min(1).max(128),
  latencyMs: z.number().int().nonnegative().nullable(),
  trafficBytes: z.number().int().nonnegative().safe().nullable(),
  certificate: SiteCertificateSchema,
}).strict();

export const AgentSiteSnapshotRecordSchema = AgentSiteSnapshotRecordBaseSchema;

export const AgentSiteSnapshotSchema = z.object({
  collectedAt: z.string().datetime(),
  collectionStatus: SiteCollectionStatusSchema,
  warnings: z.array(z.string().min(1).max(256)).max(20),
  sites: z.array(AgentSiteSnapshotRecordSchema).max(2_000),
}).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  value.sites.forEach((site, index) => {
    if (ids.has(site.id)) context.addIssue({ code: "custom", path: ["sites", index, "id"], message: "site ids must be unique" });
    ids.add(site.id);
  });
});

export const SiteRenewalStateSchema = z.object({
  batchId: z.string().uuid().nullable(),
  taskId: z.string().uuid().nullable(),
  status: CertificateRenewalStatusSchema,
  message: z.string().max(512).nullable(),
  updatedAt: nullableDateTime,
}).strict();

export const SiteRuntimeRecordSchema = AgentSiteSnapshotRecordBaseSchema.extend({
  nodeId: z.string().min(1).max(160),
  collectedAt: z.string().datetime(),
  freshness: SiteFreshnessSchema,
  renewal: SiteRenewalStateSchema,
}).strict();

export const SiteRuntimePayloadSchema = z.object({
  collectedAt: z.string().datetime(),
  collectionStatus: SiteCollectionStatusSchema,
  warnings: z.array(z.string().min(1).max(256)).max(20),
  sites: z.array(SiteRuntimeRecordSchema).max(10_000),
}).strict();

export const CreateCertificateRenewalRequestSchema = z.object({
  siteIds: z.array(OpaqueIdSchema).min(1).max(100),
  idempotencyKey: z.string().min(8).max(160).regex(/^[A-Za-z0-9:_-]+$/),
}).strict().superRefine((value, context) => {
  if (new Set(value.siteIds).size !== value.siteIds.length) {
    context.addIssue({ code: "custom", path: ["siteIds"], message: "siteIds must be unique" });
  }
});

export const CertificateRenewalBatchStatusSchema = z.enum([
  "queued", "running", "partially_succeeded", "succeeded", "failed", "cancelled", "expired",
]);
export const CertificateRenewalOperationSchema = z.object({
  siteIds: z.array(OpaqueIdSchema).min(1).max(100),
  nodeId: z.string().min(1).max(160),
  certificateId: OpaqueIdSchema,
  taskId: z.string().uuid(),
  status: CertificateRenewalStatusSchema.exclude(["idle"]),
  message: z.string().max(512).nullable(),
  updatedAt: z.string().datetime(),
}).strict();
export const CertificateRenewalBatchSchema = z.object({
  batchId: z.string().uuid(),
  status: CertificateRenewalBatchStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  operations: z.array(CertificateRenewalOperationSchema).min(1).max(100),
}).strict();

export const CertificateRenewalTaskParametersSchema = z.object({
  batchId: z.string().uuid(),
  certificates: z.array(z.object({
    certificateId: OpaqueIdSchema,
    siteIds: z.array(OpaqueIdSchema).min(1).max(100),
  }).strict()).min(1).max(20),
}).strict().superRefine((value, context) => {
  const ids = value.certificates.map((certificate) => certificate.certificateId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["certificates"], message: "certificate ids must be unique" });
  }
});

export const UpdateNodeCapabilitiesRequestSchema = z.object({
  allowedCapabilities: z.array(AgentCapabilitySchema).max(16),
}).strict().superRefine((value, context) => {
  if (new Set(value.allowedCapabilities).size !== value.allowedCapabilities.length) {
    context.addIssue({ code: "custom", path: ["allowedCapabilities"], message: "capabilities must be unique" });
  }
});

export type SiteCertificate = z.infer<typeof SiteCertificateSchema>;
export type CertificateHelperStatusData = z.infer<typeof CertificateHelperStatusDataSchema>;
export type SiteRuntimeStatus = z.infer<typeof SiteRuntimeStatusSchema>;
export type AgentSiteSnapshotRecord = z.infer<typeof AgentSiteSnapshotRecordSchema>;
export type AgentSiteSnapshot = z.infer<typeof AgentSiteSnapshotSchema>;
export type SiteRuntimeRecord = z.infer<typeof SiteRuntimeRecordSchema>;
export type SiteRuntimePayload = z.infer<typeof SiteRuntimePayloadSchema>;
export type CreateCertificateRenewalRequest = z.infer<typeof CreateCertificateRenewalRequestSchema>;
export type CertificateRenewalBatch = z.infer<typeof CertificateRenewalBatchSchema>;
export type CertificateRenewalTaskParameters = z.infer<typeof CertificateRenewalTaskParametersSchema>;
