import { HostMonitoringPayloadSchema } from "@stackpilot/contracts";
import type { HostMonitoringPayload } from "@stackpilot/contracts";
import { requestJson } from "./client";

export type { HostMonitoringPayload, HostMonitoringRecord } from "@stackpilot/contracts";

export function fetchHosts(signal?: AbortSignal) {
  return requestJson<HostMonitoringPayload>("/hosts", { signal }).then((payload) => HostMonitoringPayloadSchema.parse(payload));
}
