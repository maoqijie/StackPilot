import {
  SystemdActionResponseSchema, SystemdJournalPayloadSchema, SystemdUnitsPayloadSchema,
  type SystemdUnitAction,
} from "@stackpilot/contracts";
import { requestJson } from "./client";

export function fetchSystemdUnits(signal?: AbortSignal) {
  return requestJson<unknown>("/systemd/services", { signal }).then(SystemdUnitsPayloadSchema.parse);
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
