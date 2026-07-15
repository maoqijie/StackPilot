import {
  CreateFirewallRuleRequestSchema, DeleteFirewallRuleRequestSchema, FirewallMutationResponseSchema, FirewallRulesPayloadSchema,
  type CreateFirewallRuleRequest, type DeleteFirewallRuleRequest, type FirewallMutationResponse, type FirewallRulesPayload,
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

export type { FirewallRule, FirewallRulesPayload } from "@stackpilot/contracts";
