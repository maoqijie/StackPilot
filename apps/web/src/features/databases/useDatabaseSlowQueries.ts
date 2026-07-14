import type { DatabaseSlowQueriesPayload } from "@stackpilot/contracts";
import { fetchDatabaseSlowQueries } from "../../api/databasesApi";
import { usePollingResource } from "../../hooks/usePollingResource";

export function useDatabaseSlowQueries(range: "24h" | "7d", initialPayload: DatabaseSlowQueriesPayload | null = null) {
  return usePollingResource((signal) => fetchDatabaseSlowQueries(range, signal), initialPayload, true, range);
}
