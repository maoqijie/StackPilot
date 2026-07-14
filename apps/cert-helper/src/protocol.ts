import { activatePlan, preview, verifyActivation } from "./activation.js";
import { log } from "./audit.js";
import { buildCertificateInventory } from "./certificateMap.js";
import { helperReady, renewOpaqueCertificate } from "./certificates.js";
import { loadConfig, type HelperConfig } from "./config.js";
import { updateLifecycle } from "./lifecycle.js";
import { queryLogs } from "./logs.js";
import { rollbackRelease } from "./rollback.js";
import { prepareRepository } from "./repository.js";
import { SiteStateStore } from "./siteState.js";
import { HelperError, type HelperRequest, type HelperResponse } from "./types.js";
import { parseRequest } from "./validation.js";

export type Dependencies = {
  config?: HelperConfig;
  ready?: () => Promise<boolean>;
  inventory?: typeof buildCertificateInventory;
  prepare?: typeof prepareRepository;
  activate?: typeof activatePlan;
  rollback?: typeof rollbackRelease;
  lifecycle?: typeof updateLifecycle;
  logs?: typeof queryLogs;
  renew?: typeof renewOpaqueCertificate;
};

async function execute(request: HelperRequest, dependencies: Dependencies): Promise<HelperResponse> {
  const config = dependencies.config ?? loadConfig();
  if (request.operation === "status") {
    const ready = await (dependencies.ready ?? helperReady)();
    return ready && config.protectedDomains.size > 0
      ? { ok: true, operation: "status", data: { certificates: await (dependencies.inventory ?? buildCertificateInventory)() } }
      : { ok: false, operation: "status", errorCode: "HELPER_NOT_READY", message: "Required executables or core-site protection configuration are unavailable" };
  }
  if (request.operation === "renew") { await (dependencies.renew ?? renewOpaqueCertificate)(request.certificateId); return { ok: true, operation: "renew", data: { certificateId: request.certificateId } }; }
  const store = new SiteStateStore(config);
  if (request.operation === "prepare") {
    assertUnprotected(request.domains, config);
    const existing = await store.plan(request.planId);
    if (existing && (existing.expectedPlanDigest !== request.expectedPlanDigest || existing.nodeId !== request.nodeId)) throw new HelperError("STALE_PLAN", "Prepared plan identity changed");
    const plan = existing ?? await (dependencies.prepare ?? prepareRepository)(request, config); if (!existing) await store.savePlan(plan);
    return { ok: true, operation: "prepare", data: { operationId: request.requestId, ...preview(plan) } };
  }
  if (request.operation === "activate") {
    const plan = await verifyActivation(await store.plan(request.planId), request.stagingId, request.expectedPlanDigest);
    assertUnprotected(plan.domains, config);
    const result = await (dependencies.activate ?? activatePlan)(plan, config);
    return { ok: true, operation: "activate", data: { operationId: request.requestId, ...result } };
  }
  if (request.operation === "rollback") {
    const result = await (dependencies.rollback ?? rollbackRelease)(request.siteId, request.targetPlanId, request.targetReleaseId, request.expectedVersion, config);
    return { ok: true, operation: "rollback", data: { operationId: request.requestId, ...result } };
  }
  if (request.operation === "lifecycle") {
    const result = await (dependencies.lifecycle ?? updateLifecycle)(request.siteId, request.action, request.expectedVersion, config);
    return { ok: true, operation: "lifecycle", data: { operationId: request.requestId, ...result } };
  }
  const rows = await (dependencies.logs ?? queryLogs)(request.siteId, request.since, request.limit, config);
  return { ok: true, operation: "logs", data: { operationId: request.requestId, siteId: request.siteId, logs: rows } };
}

function assertUnprotected(domains: readonly string[], config: HelperConfig) {
  if (domains.some((domain) => config.protectedDomains.has(domain.toLowerCase()))) {
    throw new HelperError("CORE_SITE_PROTECTED", "Core StackPilot domains cannot be deployed or replaced");
  }
}

export async function handleRequest(raw: string, dependencies: Dependencies = {}): Promise<HelperResponse> {
  let request: HelperRequest;
  try { request = parseRequest(raw); }
  catch (error) { const code = error instanceof HelperError ? error.code : "INVALID_REQUEST"; return { ok: false, operation: "status", errorCode: code, message: "Request does not match the fixed helper protocol" }; }
  const started = performance.now();
  try {
    const response = await execute(request, dependencies);
    log({ level: "info", message: "Site helper operation completed", operation: request.operation, requestId: "requestId" in request ? request.requestId : undefined, durationMs: Math.round(performance.now() - started) });
    return response;
  } catch (error) {
    const code = error instanceof HelperError ? error.code : "HELPER_OPERATION_FAILED";
    log({ level: "error", message: "Site helper operation failed", operation: request.operation, requestId: "requestId" in request ? request.requestId : undefined, errorCode: code, durationMs: Math.round(performance.now() - started) });
    return { ok: false, operation: request.operation, errorCode: code, message: "Site helper operation failed; inspect structured root helper logs" };
  }
}

export { parseRequest } from "./validation.js";
