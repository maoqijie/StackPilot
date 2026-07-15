import { FirewallDenyRecordsPayloadSchema, type FirewallDenyRecordsPayload } from "@stackpilot/contracts";
import { requestJson } from "./client";

export function fetchFirewallDenyRecords(signal?: AbortSignal): Promise<FirewallDenyRecordsPayload> {
  return requestJson<unknown>("/firewall/deny-records", { signal }).then((payload) => FirewallDenyRecordsPayloadSchema.parse(payload));
}
