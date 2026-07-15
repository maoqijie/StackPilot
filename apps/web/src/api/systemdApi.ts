import {
  SystemdActionResponseSchema,
  SystemdJournalPayloadSchema,
  SystemdServicesPayloadSchema,
  type SystemdServicesPayload,
  type SystemdUnitAction,
} from "@stackpilot/contracts";
import { requestJson } from "./client";

export function fetchSystemdServices(signal?: AbortSignal): Promise<SystemdServicesPayload> {
  return requestJson<unknown>("/systemd/services", { signal }).then((payload) => SystemdServicesPayloadSchema.parse(payload));
}

export function fetchSystemdJournal(unit: string, signal?: AbortSignal) {
  return requestJson<unknown>(`/systemd/services/${encodeURIComponent(unit)}/logs`, { signal }).then(SystemdJournalPayloadSchema.parse);
}

export function mutateSystemdUnit(unit: string, action: SystemdUnitAction, reauthProof: string, idempotencyKey: string) {
  return requestJson<unknown>(`/systemd/services/${encodeURIComponent(unit)}/${action}`, {
    method: "POST",
    headers: { "X-Reauth-Proof": reauthProof },
    body: JSON.stringify({ idempotencyKey }),
  }).then(SystemdActionResponseSchema.parse);
}

export type { SystemdServiceRecord, SystemdServicesPayload } from "@stackpilot/contracts";
