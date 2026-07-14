import { z } from "zod";
import { SiteDesiredStateSchema } from "./monitoring.js";
import {
  NullableDateTimeSchema, PublicGithubRepositorySchema, SiteDomainNameSchema,
  SiteIdempotencyKeySchema, SiteOpaqueIdSchema,
} from "./shared.js";

export const SitePlanStatusSchema = z.enum(["queued", "preparing", "ready", "activating", "activated", "failed", "expired"]);
export const SiteOperationTypeSchema = z.enum(["prepare", "activate", "lifecycle", "certificate_renewal", "log_query"]);
export const SiteOperationStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "cancelled"]);
export const SiteLifecycleActionSchema = z.enum(["running", "stopped", "deleted", "restored"]);
export const SitePlanRuntimeSchema = z.enum(["static", "node20", "node22"]);
export const CertificateEnvironmentSchema = z.enum(["staging", "production"]);
const RelativeSitePathSchema = z.string().min(1).max(256).refine((value) => !value.startsWith("/") && !value.split("/").includes("..") && !value.includes("\\"), "must be a safe relative path");

export const SiteDeploymentManifestSchema = z.object({
  schemaVersion: z.literal(1), runtime: SitePlanRuntimeSchema, workingDirectory: RelativeSitePathSchema.default("."),
  buildScript: z.string().min(1).max(80).regex(/^[A-Za-z0-9:_-]+$/).nullable().default(null),
  outputDirectory: RelativeSitePathSchema.nullable().default(null),
  startScript: z.string().min(1).max(80).regex(/^[A-Za-z0-9:_-]+$/).nullable().default(null),
  healthCheckPath: z.string().min(1).max(256).regex(/^\/(?!\/)[^?#]*$/).nullable().default(null),
}).strict().superRefine((value, context) => {
  if (value.runtime === "static" && !value.outputDirectory) context.addIssue({ code: "custom", path: ["outputDirectory"], message: "static runtime requires outputDirectory" });
  if (value.runtime !== "static" && !value.startScript) context.addIssue({ code: "custom", path: ["startScript"], message: "node runtime requires startScript" });
});

export const SiteEnvironmentVariableInputSchema = z.object({
  name: z.string().min(1).max(128).regex(/^[A-Z_][A-Z0-9_]*$/),
  value: z.string().max(8_192).refine((value) => !/[\0\r\n]/.test(value), "must not contain NUL or line breaks"),
}).strict();

export const CreateSitePlanRequestSchema = z.object({
  nodeId: SiteOpaqueIdSchema, domains: z.array(SiteDomainNameSchema).min(1).max(20), repositoryUrl: PublicGithubRepositorySchema,
  repositoryRef: z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/).default("main"),
  certificateEmail: z.email().max(254), certificateEnvironment: CertificateEnvironmentSchema.default("production"),
  environmentVariables: z.array(SiteEnvironmentVariableInputSchema).max(100).default([]), idempotencyKey: SiteIdempotencyKeySchema,
}).strict().superRefine((value, context) => {
  if (new Set(value.domains).size !== value.domains.length) context.addIssue({ code: "custom", path: ["domains"], message: "domains must be unique" });
  const names = value.environmentVariables.map((entry) => entry.name);
  if (new Set(names).size !== names.length) context.addIssue({ code: "custom", path: ["environmentVariables"], message: "environment variable names must be unique" });
  if (value.repositoryRef.includes("..") || value.repositoryRef.includes("//") || value.repositoryRef.endsWith("/")) context.addIssue({ code: "custom", path: ["repositoryRef"], message: "repository ref is unsafe" });
});

export const SitePlanPreviewSchema = z.object({
  runtime: SitePlanRuntimeSchema, healthCheckPath: z.string().min(1).max(256).regex(/^\/(?!\/)[^?#]*$/).nullable(),
  changes: z.array(z.enum(["repository", "runtime", "nginx", "certificate", "environment", "traffic_switch"])).min(1).max(6),
}).strict();

export const SitePlanSchema = z.object({
  planId: z.string().uuid(), nodeId: SiteOpaqueIdSchema, domains: z.array(SiteDomainNameSchema).min(1).max(20),
  repositoryUrl: PublicGithubRepositorySchema, repositoryRef: z.string().min(1).max(160), certificateEnvironment: CertificateEnvironmentSchema,
  environmentVariableNames: z.array(z.string().regex(/^[A-Z_][A-Z0-9_]*$/)).max(100), status: SitePlanStatusSchema,
  digest: z.string().regex(/^[a-f0-9]{64}$/), version: z.number().int().positive(), preview: SitePlanPreviewSchema.nullable(),
  operationId: z.string().uuid(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(), expiresAt: z.string().datetime(),
}).strict();

export const ActivateSitePlanRequestSchema = z.object({ planVersion: z.number().int().positive(), planDigest: z.string().regex(/^[a-f0-9]{64}$/), idempotencyKey: SiteIdempotencyKeySchema }).strict();
export const UpdateSiteLifecycleRequestSchema = z.object({ action: SiteLifecycleActionSchema, version: z.number().int().positive(), idempotencyKey: SiteIdempotencyKeySchema }).strict();
export const CreateSiteCertificateRenewalRequestSchema = z.object({ version: z.number().int().positive(), idempotencyKey: SiteIdempotencyKeySchema }).strict();
export const CreateSiteLogQueryRequestSchema = z.object({ version: z.number().int().positive(), since: NullableDateTimeSchema.default(null), limit: z.number().int().min(1).max(200).default(100), idempotencyKey: SiteIdempotencyKeySchema }).strict();

export const SiteAccessLogRecordSchema = z.object({
  timestamp: z.string().datetime(), method: z.enum(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]),
  path: z.string().min(1).max(2_048).refine((path) => path.startsWith("/") && !path.includes("?"), "path must not include a query string"),
  status: z.number().int().min(100).max(599), bytesSent: z.number().int().nonnegative().safe(), clientAddressMasked: z.string().min(1).max(64),
}).strict();

export const SiteOperationResultSchema = z.object({
  message: z.string().max(512).nullable(), siteId: SiteOpaqueIdSchema.nullable(), releaseId: SiteOpaqueIdSchema.nullable(),
  stagingId: SiteOpaqueIdSchema.nullable().default(null), desiredState: SiteDesiredStateSchema.nullable().default(null),
  certificateRenewalBatchId: z.string().uuid().nullable(), planPreview: SitePlanPreviewSchema.nullable(), logs: z.array(SiteAccessLogRecordSchema).max(200),
}).strict();

export const SitePlanPrepareTaskParametersSchema = z.object({
  operationId: z.string().uuid(), planId: z.string().uuid(), domains: z.array(SiteDomainNameSchema).min(1).max(20), repositoryUrl: PublicGithubRepositorySchema,
  repositoryRef: z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/), certificateContact: z.email().max(254),
  certificateEnvironment: CertificateEnvironmentSchema, environmentVariables: z.array(SiteEnvironmentVariableInputSchema).max(100), expectedPlanDigest: z.string().regex(/^[a-f0-9]{64}$/),
  runtimeInstallAuthorized: z.boolean().default(false),
}).strict();
export const SitePlanActivateTaskParametersSchema = z.object({ operationId: z.string().uuid(), planId: z.string().uuid(), stagingId: SiteOpaqueIdSchema, expectedPlanDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const SiteLifecycleTaskParametersSchema = z.object({ operationId: z.string().uuid(), siteId: SiteOpaqueIdSchema, action: SiteLifecycleActionSchema, expectedVersion: z.number().int().positive() }).strict();
export const SiteLogQueryTaskParametersSchema = z.object({ operationId: z.string().uuid(), siteId: SiteOpaqueIdSchema, since: NullableDateTimeSchema, limit: z.number().int().min(1).max(200) }).strict();

export const SitePlanPrepareTaskResultSchema = z.object({ operationId: z.string().uuid(), stagingId: SiteOpaqueIdSchema, planPreview: SitePlanPreviewSchema }).strict();
export const SitePlanActivateTaskResultSchema = z.object({ operationId: z.string().uuid(), siteId: SiteOpaqueIdSchema, releaseId: SiteOpaqueIdSchema }).strict();
export const SiteLifecycleTaskResultSchema = z.object({ operationId: z.string().uuid(), siteId: SiteOpaqueIdSchema, desiredState: SiteDesiredStateSchema }).strict();
export const SiteLogQueryTaskResultSchema = z.object({ operationId: z.string().uuid(), siteId: SiteOpaqueIdSchema, logs: z.array(SiteAccessLogRecordSchema).max(200) }).strict();

export const SiteOperationSchema = z.object({
  operationId: z.string().uuid(), taskId: z.string().uuid().nullable().default(null), type: SiteOperationTypeSchema,
  nodeId: SiteOpaqueIdSchema, siteId: SiteOpaqueIdSchema.nullable(), planId: z.string().uuid().nullable(), status: SiteOperationStatusSchema,
  stage: z.string().min(1).max(80), progressPercent: z.number().int().min(0).max(100), result: SiteOperationResultSchema.nullable(),
  errorCode: z.string().min(1).max(80).nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).strict();

export type CreateSitePlanRequest = z.infer<typeof CreateSitePlanRequestSchema>;
export type SitePlan = z.infer<typeof SitePlanSchema>;
export type SitePlanPreview = z.infer<typeof SitePlanPreviewSchema>;
export type SiteDeploymentManifest = z.infer<typeof SiteDeploymentManifestSchema>;
export type CertificateEnvironment = z.infer<typeof CertificateEnvironmentSchema>;
export type ActivateSitePlanRequest = z.infer<typeof ActivateSitePlanRequestSchema>;
export type UpdateSiteLifecycleRequest = z.infer<typeof UpdateSiteLifecycleRequestSchema>;
export type CreateSiteCertificateRenewalRequest = z.infer<typeof CreateSiteCertificateRenewalRequestSchema>;
export type CreateSiteLogQueryRequest = z.infer<typeof CreateSiteLogQueryRequestSchema>;
export type SiteOperation = z.infer<typeof SiteOperationSchema>;
export type SiteOperationResult = z.infer<typeof SiteOperationResultSchema>;
export type SitePlanPrepareTaskParameters = z.infer<typeof SitePlanPrepareTaskParametersSchema>;
export type SitePlanActivateTaskParameters = z.infer<typeof SitePlanActivateTaskParametersSchema>;
export type SiteLifecycleTaskParameters = z.infer<typeof SiteLifecycleTaskParametersSchema>;
export type SiteLogQueryTaskParameters = z.infer<typeof SiteLogQueryTaskParametersSchema>;
