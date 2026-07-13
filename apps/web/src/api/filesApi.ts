import { TrashMutationResponseSchema, TrashPayloadSchema } from "@stackpilot/contracts";
import type { TrashMutationResponse, TrashPayload } from "@stackpilot/contracts";
import { requestJson } from "./client";

export type { RestoredTrashEntry, TrashEntry, TrashPayload } from "@stackpilot/contracts";

export function fetchFileTrash(signal?: AbortSignal) {
  return requestJson<TrashPayload>("/files/trash", { signal }).then((payload) => TrashPayloadSchema.parse(payload));
}

export function restoreTrashEntry(id: string) {
  return requestJson<TrashMutationResponse>(`/files/trash/${encodeURIComponent(id)}/restore`, { method: "POST", body: "{}" }).then((payload) => TrashMutationResponseSchema.parse(payload));
}

export function purgeTrashEntry(id: string) {
  return requestJson<TrashMutationResponse>(`/files/trash/${encodeURIComponent(id)}`, { method: "DELETE", body: "{}" }).then((payload) => TrashMutationResponseSchema.parse(payload));
}

export function purgeFileTrash() {
  return requestJson<TrashMutationResponse>("/files/trash/purge", { method: "DELETE", body: "{}" }).then((payload) => TrashMutationResponseSchema.parse(payload));
}
