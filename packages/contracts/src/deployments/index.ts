import { z } from "zod";
import { CertificateEnvironmentSchema, SitePlanRuntimeSchema } from "../sites/index.js";

export const DeploymentEnvironmentSchema = z.enum(["production", "staging", "development", "unknown"]);
export const DeploymentStatusSchema = z.enum(["queued", "preparing", "ready", "deploying", "succeeded", "failed", "expired"]);

export const DeploymentRecordSchema = z.object({
  id: z.string().uuid(),
  planId: z.string().uuid(),
  operationId: z.string().uuid(),
  nodeId: z.string().min(1).max(160),
  siteId: z.string().min(1).max(160).nullable(),
  domains: z.array(z.string().min(1).max(253)).min(1).max(20),
  repositoryUrl: z.url().max(2_048),
  repositoryRef: z.string().min(1).max(160),
  environment: DeploymentEnvironmentSchema,
  certificateEnvironment: CertificateEnvironmentSchema,
  runtime: SitePlanRuntimeSchema.nullable(),
  healthCheckPath: z.string().min(1).max(256).nullable(),
  status: DeploymentStatusSchema,
  stage: z.string().min(1).max(80),
  progressPercent: z.number().int().min(0).max(100),
  errorCode: z.string().min(1).max(80).nullable(),
  releaseId: z.string().min(1).max(160).nullable(),
  operator: z.string().min(1).max(160).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const DeploymentReleaseRecordSchema = z.object({
  releaseId: z.string().min(1).max(160),
  siteId: z.string().min(1).max(160),
  planId: z.string().uuid(),
  nodeId: z.string().min(1).max(160),
  domains: z.array(z.string().min(1).max(253)).min(1).max(20),
  repositoryRef: z.string().min(1).max(160),
  environment: DeploymentEnvironmentSchema,
  status: z.enum(["active", "historical"]),
  createdAt: z.string().datetime(),
  activatedAt: z.string().datetime().nullable(),
}).strict();

export const DeploymentPayloadSchema = z.object({
  collectedAt: z.string().datetime(),
  deployments: z.array(DeploymentRecordSchema).max(10_000),
  releases: z.array(DeploymentReleaseRecordSchema).max(10_000),
}).strict().superRefine((value, context) => {
  const deploymentIds = new Set<string>();
  value.deployments.forEach((record, index) => {
    if (deploymentIds.has(record.id)) context.addIssue({ code: "custom", path: ["deployments", index, "id"], message: "deployment ids must be unique" });
    deploymentIds.add(record.id);
  });
  const releaseIds = new Set<string>();
  value.releases.forEach((record, index) => {
    if (releaseIds.has(record.releaseId)) context.addIssue({ code: "custom", path: ["releases", index, "releaseId"], message: "release ids must be unique" });
    releaseIds.add(record.releaseId);
  });
});

export type DeploymentEnvironment = z.infer<typeof DeploymentEnvironmentSchema>;
export type DeploymentStatus = z.infer<typeof DeploymentStatusSchema>;
export type DeploymentRecord = z.infer<typeof DeploymentRecordSchema>;
export type DeploymentReleaseRecord = z.infer<typeof DeploymentReleaseRecordSchema>;
export type DeploymentPayload = z.infer<typeof DeploymentPayloadSchema>;
