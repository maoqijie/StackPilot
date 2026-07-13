import { DatabaseInstancesPayloadSchema, DatabaseSlowQueriesPayloadSchema } from "@stackpilot/contracts";
import type { DatabaseInstancesPayload, DatabaseSlowQueriesPayload } from "@stackpilot/contracts";
import { requestJson } from "./client";

export function fetchDatabases(signal?: AbortSignal): Promise<DatabaseInstancesPayload> {
  return requestJson<DatabaseInstancesPayload>("/databases", { signal }).then((payload) => DatabaseInstancesPayloadSchema.parse(payload));
}

export function fetchDatabaseSlowQueries(signal?: AbortSignal): Promise<DatabaseSlowQueriesPayload> {
  return requestJson<DatabaseSlowQueriesPayload>("/databases/slow-queries", { signal }).then((payload) => DatabaseSlowQueriesPayloadSchema.parse(payload));
}

export type { DatabaseInstanceRecord, DatabaseInstancesPayload, DatabaseSlowQueriesPayload, DatabaseSlowQueryInstance, DatabaseSlowQueryRecord } from "@stackpilot/contracts";
