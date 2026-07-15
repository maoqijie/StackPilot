import { AuditEventsResponseSchema, type AuditEventsResponse } from "@stackpilot/contracts";
import { requestJson } from "./client";

export const fetchAuditEvents = (actionPrefix?: string, signal?: AbortSignal): Promise<AuditEventsResponse> => {
  const query = new URLSearchParams({ limit: "200" });
  if (actionPrefix) query.set("actionPrefix", actionPrefix);
  return requestJson<unknown>(`/audit?${query}`, { signal }).then(AuditEventsResponseSchema.parse);
};
