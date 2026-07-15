import { log } from "./audit.js";
import { loadConfig, type HelperConfig } from "./config.js";
import { createFirewallRule, deleteFirewallRule, listFirewallRules } from "./firewall.js";
import { HelperError, type FirewallHelperRequest, type HelperResponse } from "./types.js";
import { parseFirewallRequest } from "./validation.js";

export type FirewallDependencies = { config?: HelperConfig; list?: typeof listFirewallRules; create?: typeof createFirewallRule; delete?: typeof deleteFirewallRule };

export async function handleFirewallRequest(raw: string, dependencies: FirewallDependencies = {}): Promise<HelperResponse> {
  let request: FirewallHelperRequest;
  try { request = parseFirewallRequest(raw); }
  catch (error) { return { ok: false, operation: "firewall-list", errorCode: error instanceof HelperError ? error.code : "INVALID_REQUEST", message: "Request does not match the fixed firewall helper protocol" }; }
  const started = performance.now();
  try {
    const data = request.operation === "firewall-list" ? await (dependencies.list ?? listFirewallRules)()
      : request.operation === "firewall-create" ? await (dependencies.create ?? createFirewallRule)(request, (dependencies.config ?? loadConfig()).stateRoot)
        : await (dependencies.delete ?? deleteFirewallRule)(request, (dependencies.config ?? loadConfig()).stateRoot);
    log({ level: "info", message: "Firewall helper operation completed", operation: request.operation, requestId: "requestId" in request ? request.requestId : undefined, durationMs: Math.round(performance.now() - started) });
    return { ok: true, operation: request.operation, data: data as Record<string, unknown> };
  } catch (error) {
    const code = error instanceof HelperError ? error.code : "FIREWALL_OPERATION_FAILED";
    log({ level: "error", message: "Firewall helper operation failed", operation: request.operation, requestId: "requestId" in request ? request.requestId : undefined, errorCode: code, durationMs: Math.round(performance.now() - started) });
    return { ok: false, operation: request.operation, errorCode: code, message: "Firewall helper operation failed; inspect structured root helper logs" };
  }
}
