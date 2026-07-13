import {
  CreateDatabaseBackupRequestSchema,
  DatabaseBackupMutationResponseSchema,
  DatabaseBackupsPayloadSchema,
} from "@stackpilot/contracts";
import type { CreateDatabaseBackupRequest, DatabaseBackupMutationResponse, DatabaseBackupsPayload } from "@stackpilot/contracts";
import { requestJson } from "./client";

export function fetchDatabaseBackups(signal?: AbortSignal) {
  return requestJson<DatabaseBackupsPayload>("/database-backups", { signal })
    .then((payload) => DatabaseBackupsPayloadSchema.parse(payload));
}

export function createDatabaseBackup(payload: CreateDatabaseBackupRequest, reauthProof: string) {
  return requestJson<DatabaseBackupMutationResponse>("/database-backups", {
    method: "POST",
    headers: { "X-Reauth-Proof": reauthProof },
    body: JSON.stringify(CreateDatabaseBackupRequestSchema.parse(payload)),
  }).then((result) => DatabaseBackupMutationResponseSchema.parse(result));
}

export function verifyDatabaseBackup(id: string, reauthProof: string) {
  return mutation(`/database-backups/verify/${encodeURIComponent(id)}`, reauthProof);
}

export function drillDatabaseBackup(id: string, reauthProof: string) {
  return mutation(`/database-backups/drill/${encodeURIComponent(id)}`, reauthProof);
}

function mutation(path: string, reauthProof: string) {
  return requestJson<DatabaseBackupMutationResponse>(path, {
    method: "POST",
    headers: { "X-Reauth-Proof": reauthProof },
    body: "{}",
  }).then((result) => DatabaseBackupMutationResponseSchema.parse(result));
}
