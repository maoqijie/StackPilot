import { AuditEventsResponseSchema } from "@stackpilot/contracts";
import type { AuditEvent, AuditEventsResponse, AuditQuery } from "@stackpilot/contracts";
import { requestJson } from "./client";

type FetchAuditOptions = Partial<AuditQuery> & { signal?: AbortSignal };

export const fetchAuditEvents = ({ signal, ...query }: FetchAuditOptions = {}) => {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.result !== undefined) params.set("result", query.result);
  if (query.actionPrefix !== undefined) params.set("actionPrefix", query.actionPrefix);
  const search = params.size ? `?${params.toString()}` : "";
  return requestJson<unknown>(`/audit${search}`, { signal })
  .then((payload) => AuditEventsResponseSchema.parse(payload));
};

export type { AuditEvent, AuditEventsResponse };
