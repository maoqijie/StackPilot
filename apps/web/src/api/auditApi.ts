import { z } from "zod";
import { requestJson } from "./client";

const AuditEventSchema = z.object({
  eventId: z.string().min(1),
  occurredAt: z.string().datetime(),
  actorType: z.string().min(1),
  actorId: z.string().nullable(),
  source: z.string().min(1),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  action: z.string().min(1),
  parameters: z.string(),
  outcome: z.string().min(1),
  requestId: z.string().min(1),
  traceId: z.string().min(1),
}).passthrough();

const AuditEventsResponseSchema = z.object({ events: z.array(AuditEventSchema) }).strict();

export const fetchAuditEvents = (signal?: AbortSignal) => requestJson<unknown>("/audit", { signal })
  .then((payload) => AuditEventsResponseSchema.parse(payload).events);

export type AuditEvent = z.infer<typeof AuditEventSchema>;
