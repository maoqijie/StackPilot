import { DatabaseInstancesPayloadSchema } from "@stackpilot/contracts";
import type { DatabaseInstancesPayload } from "@stackpilot/contracts";
import { requestJson } from "./client";

export type { DatabaseInstanceRecord, DatabaseInstancesPayload } from "@stackpilot/contracts";

export function fetchDatabases(signal?: AbortSignal): Promise<DatabaseInstancesPayload> {
  return requestJson<DatabaseInstancesPayload>("/databases", { signal }).then((payload) => DatabaseInstancesPayloadSchema.parse(payload));
}
