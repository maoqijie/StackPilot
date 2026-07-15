import {
  CreateFirewallRuleRequestSchema,
  DeleteFirewallRuleRequestSchema,
  FirewallDenyRecordsPayloadSchema,
  FirewallMutationResponseSchema,
  FirewallOpenPortsPayloadSchema,
  FirewallPayloadSchema,
  type CreateFirewallRuleRequest,
  type FirewallDenyRecordsPayload,
  type FirewallMutationResponse,
  type FirewallOpenPortsPayload,
  type FirewallPayload,
} from "@stackpilot/contracts";
import { requestJson } from "./client";

export function fetchFirewallDenyRecords(signal?: AbortSignal): Promise<FirewallDenyRecordsPayload> {
  return requestJson<unknown>("/firewall/deny-records", { signal }).then((payload) => FirewallDenyRecordsPayloadSchema.parse(payload));
}

export function fetchFirewall(signal?: AbortSignal) {
  return requestJson<FirewallPayload>("/firewall", { signal }).then((payload) => FirewallPayloadSchema.parse(payload));
}

export function fetchFirewallOpenPorts(signal?: AbortSignal): Promise<FirewallOpenPortsPayload> {
  return requestJson<unknown>("/firewall/open-ports", { signal }).then((payload) => FirewallOpenPortsPayloadSchema.parse(payload));
}

export function createFirewallRule(input: CreateFirewallRuleRequest, proof: string) {
  return requestJson<FirewallMutationResponse>("/firewall/rules", { method: "POST", headers: { "X-Reauth-Proof": proof }, body: JSON.stringify(CreateFirewallRuleRequestSchema.parse(input)) })
    .then((payload) => FirewallMutationResponseSchema.parse(payload));
}

export function deleteFirewallRule(ruleId: string, idempotencyKey: string, proof: string) {
  const input = DeleteFirewallRuleRequestSchema.parse({ idempotencyKey });
  return requestJson<FirewallMutationResponse>(`/firewall/${encodeURIComponent(ruleId)}`, { method: "DELETE", headers: { "X-Reauth-Proof": proof }, body: JSON.stringify(input) })
    .then((payload) => FirewallMutationResponseSchema.parse(payload));
}

export type { FirewallOpenPort, FirewallOpenPortsPayload } from "@stackpilot/contracts";
