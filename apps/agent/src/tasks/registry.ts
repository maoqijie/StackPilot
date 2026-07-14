import type { AgentCapability, AgentPlatform, RemoteTaskEnvelope, RemoteTaskResultSummary } from "@stackpilot/contracts";
import {
  CertificateRenewalTaskParametersSchema, ServiceStatusTaskParametersSchema, SiteLifecycleTaskParametersSchema,
  SiteLogQueryTaskParametersSchema, SitePlanActivateTaskParametersSchema, SitePlanPrepareTaskParametersSchema,
  SiteRollbackTaskParametersSchema, SystemSummaryTaskParametersSchema, TerminalCommandTaskParametersSchema,
} from "@stackpilot/contracts";
import { certificateRenewalHandler } from "./handlers/certificateRenewal.js";
import { serviceStatusHandler } from "./handlers/serviceStatus.js";
import { systemSummaryHandler } from "./handlers/systemSummary.js";
import { siteLifecycleHandler, siteLogsHandler, sitePlanActivateHandler, sitePlanPrepareHandler, siteRollbackHandler } from "./handlers/siteOperations.js";
import { terminalCommandHandler } from "./handlers/terminalCommand.js";

export type TaskDefinition = { capability: AgentCapability; platforms: readonly AgentPlatform[]; timeoutMs: number; maxOutputBytes: number; cancellable: boolean; retryable: boolean; validate(parameters: unknown): unknown; run(parameters: unknown, signal: AbortSignal, nodeId: string): Promise<RemoteTaskResultSummary> };
const allPlatforms: readonly AgentPlatform[] = ["linux", "darwin", "win32"];
export const taskRegistry: Readonly<Record<RemoteTaskEnvelope["type"], TaskDefinition>> = Object.freeze({
  "system.summary.read": { capability: "system.summary.read", platforms: allPlatforms, timeoutMs: 6_000, maxOutputBytes: 16_384, cancellable: true, retryable: true, validate: (value) => SystemSummaryTaskParametersSchema.parse(value), run: (value) => systemSummaryHandler(value) },
  "service.status.read": { capability: "service.status.read", platforms: allPlatforms, timeoutMs: 6_000, maxOutputBytes: 16_384, cancellable: true, retryable: true, validate: (value) => ServiceStatusTaskParametersSchema.parse(value), run: serviceStatusHandler },
  "terminal.command.execute": { capability: "terminal.command.execute", platforms: ["linux"], timeoutMs: 10_000, maxOutputBytes: 1_024, cancellable: true, retryable: false, validate: (value) => TerminalCommandTaskParametersSchema.parse(value), run: (value, signal) => terminalCommandHandler(value, signal) },
  "sites.plan.prepare": { capability: "sites.deploy", platforms: ["linux"], timeoutMs: 1_800_000, maxOutputBytes: 16_384, cancellable: true, retryable: false, validate: (value) => SitePlanPrepareTaskParametersSchema.parse(value), run: (value, signal, nodeId) => sitePlanPrepareHandler(value, signal, nodeId) },
  "sites.plan.activate": { capability: "sites.deploy", platforms: ["linux"], timeoutMs: 600_000, maxOutputBytes: 16_384, cancellable: true, retryable: false, validate: (value) => SitePlanActivateTaskParametersSchema.parse(value), run: sitePlanActivateHandler },
  "sites.rollback": { capability: "sites.deploy", platforms: ["linux"], timeoutMs: 120_000, maxOutputBytes: 16_384, cancellable: false, retryable: false, validate: (value) => SiteRollbackTaskParametersSchema.parse(value), run: siteRollbackHandler },
  "sites.lifecycle.update": { capability: "sites.lifecycle.manage", platforms: ["linux"], timeoutMs: 120_000, maxOutputBytes: 16_384, cancellable: true, retryable: false, validate: (value) => SiteLifecycleTaskParametersSchema.parse(value), run: siteLifecycleHandler },
  "sites.logs.read": { capability: "sites.logs.read", platforms: ["linux"], timeoutMs: 60_000, maxOutputBytes: 16_384, cancellable: true, retryable: false, validate: (value) => SiteLogQueryTaskParametersSchema.parse(value), run: siteLogsHandler },
  "sites.certificates.renew": { capability: "sites.certificates.renew", platforms: ["linux"], timeoutMs: 600_000, maxOutputBytes: 16_384, cancellable: false, retryable: false, validate: (value) => CertificateRenewalTaskParametersSchema.parse(value), run: certificateRenewalHandler },
});
