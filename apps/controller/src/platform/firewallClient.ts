import { connect } from "node:net";
import type { CreateFirewallRuleRequest, DeleteFirewallRuleRequest } from "@stackpilot/contracts";

const SOCKET_PATH = "/run/stackpilot-firewall-helper/helper.sock";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export type FirewallHelperRequest =
  | { operation: "firewall-list" }
  | ({ operation: "firewall-create"; requestId: string } & Omit<CreateFirewallRuleRequest, "idempotencyKey">)
  | ({ operation: "firewall-delete"; requestId: string; ruleId: string } & Omit<DeleteFirewallRuleRequest, "idempotencyKey">);
type FirewallHelperResponse = { ok: boolean; operation: FirewallHelperRequest["operation"]; errorCode?: string; message?: string; data?: unknown };
export type FirewallHelperRequester = (request: FirewallHelperRequest, socketPath?: string) => Promise<FirewallHelperResponse>;

export class FirewallHelperError extends Error {
  constructor(public readonly code: string, message = "Firewall helper request failed") { super(message); this.name = code; }
}

export function requestFirewallHelper(request: FirewallHelperRequest, socketPath = SOCKET_PATH): Promise<FirewallHelperResponse> {
  return new Promise((resolve, reject) => {
    const socket = connect({ path: socketPath }); let response = "";
    const fail = (error: unknown) => { socket.destroy(); reject(error instanceof FirewallHelperError ? error : new FirewallHelperError("FIREWALL_HELPER_UNAVAILABLE")); };
    socket.setTimeout(request.operation === "firewall-list" ? 10_000 : 30_000, () => fail(new FirewallHelperError("FIREWALL_HELPER_TIMEOUT")));
    socket.once("connect", () => socket.end(`${JSON.stringify(request)}\n`));
    socket.on("data", (chunk: Buffer) => { response += chunk.toString("utf8"); if (Buffer.byteLength(response) > MAX_RESPONSE_BYTES) fail(new FirewallHelperError("FIREWALL_HELPER_RESPONSE_TOO_LARGE")); });
    socket.once("error", fail);
    socket.once("end", () => {
      try {
        const parsed = JSON.parse(response.trim()) as FirewallHelperResponse;
        if (!parsed || typeof parsed.ok !== "boolean" || parsed.operation !== request.operation) throw new Error();
        if (!parsed.ok) { reject(new FirewallHelperError(parsed.errorCode ?? "FIREWALL_HELPER_FAILED", parsed.message)); return; }
        resolve(parsed);
      } catch (error) { reject(error instanceof FirewallHelperError ? error : new FirewallHelperError("FIREWALL_HELPER_INVALID_RESPONSE")); }
    });
  });
}
