import { connect } from "node:net";
import { StringDecoder } from "node:string_decoder";
import type { CreateFirewallRuleRequest, DeleteFirewallRuleRequest } from "@stackpilot/contracts";

const SOCKET_PATH = "/run/stackpilot-firewall-helper/helper.sock";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const FIREWALL_HELPER_TIMEOUT_MS = { list: 90_000, mutation: 120_000 } as const;
export type FirewallHelperRequest =
  | { operation: "firewall-list" }
  | ({ operation: "firewall-create"; requestId: string } & Omit<CreateFirewallRuleRequest, "idempotencyKey">)
  | ({ operation: "firewall-delete"; requestId: string; ruleId: string } & Omit<DeleteFirewallRuleRequest, "idempotencyKey">);
type FirewallHelperResponse = { ok: boolean; operation: FirewallHelperRequest["operation"]; errorCode?: string; message?: string; data?: unknown };
export type FirewallHelperRequester = (request: FirewallHelperRequest, socketPath?: string, timeoutMs?: number) => Promise<FirewallHelperResponse>;

export class FirewallHelperError extends Error {
  constructor(public readonly code: string, message = "Firewall helper request failed") { super(message); this.name = code; }
}

export function requestFirewallHelper(request: FirewallHelperRequest, socketPath = SOCKET_PATH, timeoutMs?: number): Promise<FirewallHelperResponse> {
  return new Promise((resolve, reject) => {
    const socket = connect({ path: socketPath }); const decoder = new StringDecoder("utf8"); let response = "", responseBytes = 0;
    const fail = (error: unknown) => { socket.destroy(); reject(error instanceof FirewallHelperError ? error : new FirewallHelperError("FIREWALL_HELPER_UNAVAILABLE")); };
    socket.setTimeout(timeoutMs ?? (request.operation === "firewall-list" ? FIREWALL_HELPER_TIMEOUT_MS.list : FIREWALL_HELPER_TIMEOUT_MS.mutation), () => fail(new FirewallHelperError("FIREWALL_HELPER_TIMEOUT")));
    socket.once("connect", () => socket.end(`${JSON.stringify(request)}\n`));
    socket.on("data", (chunk: Buffer) => { responseBytes += chunk.length; response += decoder.write(chunk); if (responseBytes > MAX_RESPONSE_BYTES) fail(new FirewallHelperError("FIREWALL_HELPER_RESPONSE_TOO_LARGE")); });
    socket.once("error", fail);
    socket.once("end", () => {
      try {
        response += decoder.end(); const parsed = JSON.parse(response.trim()) as FirewallHelperResponse;
        if (!parsed || typeof parsed.ok !== "boolean" || parsed.operation !== request.operation) throw new Error();
        if (!parsed.ok) { reject(new FirewallHelperError(parsed.errorCode ?? "FIREWALL_HELPER_FAILED", parsed.message)); return; }
        resolve(parsed);
      } catch (error) { reject(error instanceof FirewallHelperError ? error : new FirewallHelperError("FIREWALL_HELPER_INVALID_RESPONSE")); }
    });
  });
}
