import { FirewallOpenPortsPayloadSchema, type FirewallOpenPortsPayload } from "@stackpilot/contracts";
import { requestJson } from "./client";

export function fetchFirewallOpenPorts(signal?: AbortSignal): Promise<FirewallOpenPortsPayload> {
  return requestJson<unknown>("/firewall/open-ports", { signal }).then((payload) => FirewallOpenPortsPayloadSchema.parse(payload));
}

export type { FirewallOpenPort, FirewallOpenPortsPayload } from "@stackpilot/contracts";
