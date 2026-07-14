import { SystemdServicesPayloadSchema, type SystemdServicesPayload } from "@stackpilot/contracts";
import { requestJson } from "./client";

export function fetchSystemdServices(signal?: AbortSignal): Promise<SystemdServicesPayload> {
  return requestJson<unknown>("/systemd/services", { signal }).then((payload) => SystemdServicesPayloadSchema.parse(payload));
}

export type { SystemdServiceRecord, SystemdServicesPayload } from "@stackpilot/contracts";
