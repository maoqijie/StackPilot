import {
  CreateFirewallRuleRequestSchema, DeleteFirewallRuleRequestSchema, FirewallMutationResponseSchema, FirewallRulesPayloadSchema,
  FirewallOpenPortsPayloadSchema,
  type CreateFirewallRuleRequest, type DeleteFirewallRuleRequest, type FirewallMutationResponse, type FirewallRulesPayload, type FirewallOpenPortsPayload,
} from "@stackpilot/contracts";
import { requestJson } from "./client";

export function fetchFirewallRules(signal?: AbortSignal): Promise<FirewallRulesPayload> {
  return requestJson<unknown>("/firewall/rules", { signal }).then(FirewallRulesPayloadSchema.parse);
}
export function createFirewallRule(input: CreateFirewallRuleRequest, reauthProof: string): Promise<FirewallMutationResponse> {
  return requestJson<unknown>("/firewall/rules", { method: "POST", headers: { "X-Reauth-Proof": reauthProof }, body: JSON.stringify(CreateFirewallRuleRequestSchema.parse(input)) }).then(FirewallMutationResponseSchema.parse);
}
export function deleteFirewallRule(id: string, input: DeleteFirewallRuleRequest, reauthProof: string): Promise<FirewallMutationResponse> {
  return requestJson<unknown>(`/firewall/rules/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "X-Reauth-Proof": reauthProof }, body: JSON.stringify(DeleteFirewallRuleRequestSchema.parse(input)) }).then(FirewallMutationResponseSchema.parse);
}

export function fetchFirewallOpenPorts(signal?: AbortSignal): Promise<FirewallOpenPortsPayload> {
  return requestJson<unknown>("/firewall/open-ports", { signal }).then(FirewallOpenPortsPayloadSchema.parse);
}

export type { FirewallOpenPort, FirewallOpenPortsPayload, FirewallRule, FirewallRulesPayload } from "@stackpilot/contracts";
