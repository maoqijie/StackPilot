import type { AgentCapability, AgentPlatform, RemoteTaskEnvelope, RemoteTaskResultSummary } from "@stackpilot/contracts";
import { CertificateRenewalTaskParametersSchema, ServiceStatusTaskParametersSchema, SystemSummaryTaskParametersSchema } from "@stackpilot/contracts";
import { certificateRenewalHandler } from "./handlers/certificateRenewal.js";
import { serviceStatusHandler } from "./handlers/serviceStatus.js";
import { systemSummaryHandler } from "./handlers/systemSummary.js";

export type TaskDefinition = { capability: AgentCapability; platforms: readonly AgentPlatform[]; timeoutMs: number; maxOutputBytes: number; cancellable: boolean; retryable: boolean; validate(parameters: unknown): unknown; run(parameters: unknown, signal: AbortSignal, nodeId: string): Promise<RemoteTaskResultSummary> };
const allPlatforms: readonly AgentPlatform[] = ["linux", "darwin", "win32"];
export const taskRegistry: Readonly<Record<RemoteTaskEnvelope["type"], TaskDefinition>> = Object.freeze({
  "system.summary.read": { capability: "system.summary.read", platforms: allPlatforms, timeoutMs: 6_000, maxOutputBytes: 16_384, cancellable: true, retryable: true, validate: (value) => SystemSummaryTaskParametersSchema.parse(value), run: (value) => systemSummaryHandler(value) },
  "service.status.read": { capability: "service.status.read", platforms: allPlatforms, timeoutMs: 6_000, maxOutputBytes: 16_384, cancellable: true, retryable: true, validate: (value) => ServiceStatusTaskParametersSchema.parse(value), run: serviceStatusHandler },
  "sites.certificates.renew": { capability: "sites.certificates.renew", platforms: ["linux"], timeoutMs: 600_000, maxOutputBytes: 16_384, cancellable: false, retryable: false, validate: (value) => CertificateRenewalTaskParametersSchema.parse(value), run: certificateRenewalHandler },
});
