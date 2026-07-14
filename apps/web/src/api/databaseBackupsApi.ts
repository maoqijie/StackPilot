import { CreateSystemBackupRequestSchema, SystemBackupMutationResponseSchema, SystemBackupsPayloadSchema } from "@stackpilot/contracts";
import type { SystemBackupsPayload } from "@stackpilot/contracts";
import type { z } from "zod";
import { requestJson } from "./client";

export function fetchSystemBackups(signal?: AbortSignal) {
  return requestJson<SystemBackupsPayload>("/database-backups", { signal }).then((payload) => SystemBackupsPayloadSchema.parse(payload));
}

export function createSystemBackup(payload: z.infer<typeof CreateSystemBackupRequestSchema>, reauthProof: string) {
  return requestJson<z.infer<typeof SystemBackupMutationResponseSchema>>("/database-backups", {
    method: "POST",
    headers: { "X-Reauth-Proof": reauthProof },
    body: JSON.stringify(CreateSystemBackupRequestSchema.parse(payload)),
  }).then((result) => SystemBackupMutationResponseSchema.parse(result));
}

export function verifySystemBackup(id: string, reauthProof: string) {
  return mutation(`/database-backups/verify/${encodeURIComponent(id)}`, reauthProof);
}

export function drillSystemBackup(id: string, reauthProof: string) {
  return mutation(`/database-backups/drill/${encodeURIComponent(id)}`, reauthProof);
}

function mutation(path: string, reauthProof: string) {
  return requestJson<z.infer<typeof SystemBackupMutationResponseSchema>>(path, {
    method: "POST",
    headers: { "X-Reauth-Proof": reauthProof },
    body: "{}",
  }).then((result) => SystemBackupMutationResponseSchema.parse(result));
}

// Rolling-upgrade aliases for callers outside the settings system-backup surface.
export const fetchDatabaseBackups = fetchSystemBackups;
export const createDatabaseBackup = createSystemBackup;
export const verifyDatabaseBackup = verifySystemBackup;
export const drillDatabaseBackup = drillSystemBackup;
