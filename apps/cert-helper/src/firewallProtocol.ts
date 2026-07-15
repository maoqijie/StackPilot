import { createFirewallRule, deleteFirewallRule, listFirewall } from "./firewall.js";
import { log } from "./audit.js";
import { HelperError } from "./types.js";

type FirewallRequest =
  | { operation: "firewall-list" }
  | { operation: "firewall-create"; requestId: string; name: string; port: number; protocol: "TCP" | "UDP"; source: string }
  | { operation: "firewall-delete"; requestId: string; ruleId: string };
type FirewallResponse = { ok: boolean; operation: FirewallRequest["operation"]; data?: Record<string, unknown>; errorCode?: string; message?: string };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ruleId = /^fw_[a-f0-9]{64}$/;
const source = /^(?:\d{1,3}\.){3}\d{1,3}(?:\/(?:[0-9]|[12][0-9]|3[0-2]))?$/;
const stackpilotMarker = /\[sp:[0-9a-f-]{36}\]/iu;
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");

function validSource(value: string) {
  if (!source.test(value)) return false;
  return value.split("/")[0]!.split(".").every((octet) => Number(octet) <= 255);
}

function validName(value: string) {
  if (stackpilotMarker.test(value)) return false;
  return [...value].every((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint > 0x1f && (codePoint < 0x7f || codePoint > 0x9f) && codePoint !== 0x2028 && codePoint !== 0x2029;
  });
}

export function parseFirewallRequest(raw: string): FirewallRequest {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new HelperError("INVALID_REQUEST", "Firewall helper request must be JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HelperError("INVALID_REQUEST", "Firewall helper request must be an object");
  const row = value as Record<string, unknown>;
  if (row.operation === "firewall-list" && exactKeys(row, ["operation"])) return { operation: row.operation };
  if (row.operation === "firewall-create" && exactKeys(row, ["operation", "requestId", "name", "port", "protocol", "source"])
    && typeof row.requestId === "string" && uuid.test(row.requestId) && typeof row.name === "string" && row.name.trim().length >= 1 && row.name.length <= 64 && validName(row.name)
    && Number.isInteger(row.port) && Number(row.port) >= 1 && Number(row.port) <= 65_535 && (row.protocol === "TCP" || row.protocol === "UDP")
    && typeof row.source === "string" && validSource(row.source)) {
    return { operation: row.operation, requestId: row.requestId.toLowerCase(), name: row.name.trim(), port: Number(row.port), protocol: row.protocol, source: row.source };
  }
  if (row.operation === "firewall-delete" && exactKeys(row, ["operation", "requestId", "ruleId"])
    && typeof row.requestId === "string" && uuid.test(row.requestId) && typeof row.ruleId === "string" && ruleId.test(row.ruleId)) {
    return { operation: row.operation, requestId: row.requestId.toLowerCase(), ruleId: row.ruleId };
  }
  throw new HelperError("INVALID_REQUEST", "Request does not match the fixed firewall helper protocol");
}

async function execute(request: FirewallRequest) {
  if (request.operation === "firewall-list") return listFirewall();
  if (request.operation === "firewall-create") return createFirewallRule(request);
  return deleteFirewallRule(request);
}

export async function handleFirewallRequest(raw: string): Promise<FirewallResponse> {
  let request: FirewallRequest;
  try { request = parseFirewallRequest(raw); }
  catch (error) { return { ok: false, operation: "firewall-list", errorCode: error instanceof HelperError ? error.code : "INVALID_REQUEST", message: "Request does not match the fixed firewall helper protocol" }; }
  const started = performance.now();
  try {
    const data = await execute(request);
    log({ level: "info", message: "Firewall helper operation completed", operation: request.operation, requestId: "requestId" in request ? request.requestId : undefined, durationMs: Math.round(performance.now() - started) });
    return { ok: true, operation: request.operation, data: data as unknown as Record<string, unknown> };
  } catch (error) {
    const errorCode = error instanceof HelperError ? error.code : "FIREWALL_OPERATION_FAILED";
    log({ level: "error", message: "Firewall helper operation failed", operation: request.operation, requestId: "requestId" in request ? request.requestId : undefined, errorCode, durationMs: Math.round(performance.now() - started) });
    return { ok: false, operation: request.operation, errorCode, message: "Firewall helper operation failed; inspect structured root helper logs" };
  }
}
