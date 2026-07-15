import {
  CreateFirewallRuleRequestSchema,
  DeleteFirewallRuleRequestSchema,
  FirewallDenyRecordsPayloadSchema,
  FirewallMutationResponseSchema,
  FirewallOpenPortsPayloadSchema,
  FirewallRulesPayloadSchema,
  type CreateFirewallRuleRequest,
  type DeleteFirewallRuleRequest,
  type FirewallDenyRecordsPayload,
  type FirewallMutationResponse,
  type FirewallOpenPortsPayload,
  type FirewallRulesPayload,
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

export function fetchFirewallDenyRecords(signal?: AbortSignal): Promise<FirewallDenyRecordsPayload> {
  return requestJson<unknown>("/firewall/deny-records", { signal }).then(FirewallDenyRecordsPayloadSchema.parse);
}

export function fetchFirewallOpenPorts(signal?: AbortSignal): Promise<FirewallOpenPortsPayload> {
  return requestJson<unknown>("/firewall/open-ports", { signal }).then(FirewallOpenPortsPayloadSchema.parse);
}

export type { FirewallOpenPort, FirewallOpenPortsPayload, FirewallRule, FirewallRulesPayload } from "@stackpilot/contracts";
