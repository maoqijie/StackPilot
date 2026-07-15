import {
  FirewallDenyRecordsPayloadSchema,
  FirewallOpenPortsPayloadSchema,
  type FirewallDenyRecordsPayload,
  type FirewallOpenPortsPayload,
} from "@stackpilot/contracts";
import { requestJson } from "./client";

export function fetchFirewallDenyRecords(signal?: AbortSignal): Promise<FirewallDenyRecordsPayload> {
  return requestJson<unknown>("/firewall/deny-records", { signal }).then((payload) => FirewallDenyRecordsPayloadSchema.parse(payload));
}

export function fetchFirewallOpenPorts(signal?: AbortSignal): Promise<FirewallOpenPortsPayload> {
  return requestJson<unknown>("/firewall/open-ports", { signal }).then((payload) => FirewallOpenPortsPayloadSchema.parse(payload));
}

export type { FirewallOpenPort, FirewallOpenPortsPayload } from "@stackpilot/contracts";
