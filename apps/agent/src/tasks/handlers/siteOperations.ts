import {
  SiteLifecycleTaskParametersSchema, SiteLogQueryTaskParametersSchema, SitePlanActivateTaskParametersSchema,
  SitePlanPrepareTaskParametersSchema, type RemoteTaskResultSummary,
} from "@stackpilot/contracts";
import { requestCertHelper } from "../../sites/helperClient.js";

async function execute(request: Parameters<typeof requestCertHelper>[0], signal: AbortSignal, expectedOperation: string, socketPath?: string): Promise<RemoteTaskResultSummary> {
  const response = await requestCertHelper(request, signal, socketPath);
  if (!response.data || response.operation !== expectedOperation) throw Object.assign(new Error("Invalid site helper result"), { code: "SITE_HELPER_INVALID_RESULT" });
  return { message: `Site ${expectedOperation} operation completed`, data: response.data, truncated: false };
}

export async function sitePlanPrepareHandler(parameters: unknown, signal: AbortSignal, nodeId: string, socketPath?: string) {
  const input = SitePlanPrepareTaskParametersSchema.parse(parameters);
  return execute({ operation: "prepare", requestId: input.operationId, planId: input.planId, nodeId, domains: input.domains, repositoryUrl: input.repositoryUrl, repositoryRef: input.repositoryRef, certificateEmail: input.certificateContact, certificateEnvironment: input.certificateEnvironment, environmentVariables: input.environmentVariables, expectedPlanDigest: input.expectedPlanDigest }, signal, "prepare", socketPath);
}

export async function sitePlanActivateHandler(parameters: unknown, signal: AbortSignal, _nodeId?: string, socketPath?: string) {
  const input = SitePlanActivateTaskParametersSchema.parse(parameters);
  return execute({ operation: "activate", requestId: input.operationId, planId: input.planId, stagingId: input.stagingId, expectedPlanDigest: input.expectedPlanDigest }, signal, "activate", socketPath);
}

export async function siteLifecycleHandler(parameters: unknown, signal: AbortSignal, _nodeId?: string, socketPath?: string) {
  const input = SiteLifecycleTaskParametersSchema.parse(parameters);
  return execute({ operation: "lifecycle", requestId: input.operationId, siteId: input.siteId, action: input.action, expectedVersion: input.expectedVersion }, signal, "lifecycle", socketPath);
}

export async function siteLogsHandler(parameters: unknown, signal: AbortSignal, _nodeId?: string, socketPath?: string) {
  const input = SiteLogQueryTaskParametersSchema.parse(parameters);
  return execute({ operation: "logs", requestId: input.operationId, siteId: input.siteId, since: input.since, limit: input.limit }, signal, "logs", socketPath);
}
