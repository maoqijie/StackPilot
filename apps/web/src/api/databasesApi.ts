import { DatabaseSlowQueriesPayloadSchema } from "@stackpilot/contracts";
import type { DatabaseSlowQueriesPayload } from "@stackpilot/contracts";
import { requestJson } from "./client";

export function fetchDatabaseSlowQueries(signal?: AbortSignal) {
  return requestJson<DatabaseSlowQueriesPayload>("/databases/slow-queries", { signal }).then((payload) => DatabaseSlowQueriesPayloadSchema.parse(payload));
}

export type { DatabaseSlowQueriesPayload, DatabaseSlowQueryInstance, DatabaseSlowQueryRecord } from "@stackpilot/contracts";
