import { AuditEventsResponseSchema } from "@stackpilot/contracts";
import type { AuditEvent, AuditEventsResponse } from "@stackpilot/contracts";
import { requestJson } from "./client";

export const fetchAuditEvents = (signal?: AbortSignal) => requestJson<unknown>("/audit", { signal })
  .then((payload) => AuditEventsResponseSchema.parse(payload));

export type { AuditEvent, AuditEventsResponse };
