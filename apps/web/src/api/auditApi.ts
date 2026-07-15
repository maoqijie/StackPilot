import { AuditEventsResponseSchema } from "@stackpilot/contracts";
import type { AuditEvent, AuditEventsQuery, AuditEventsResponse } from "@stackpilot/contracts";
import { requestJson } from "./client";

const AUDIT_EXPORT_PAGE_LIMIT = 1_000;

export const fetchAuditEvents = (query: AuditEventsQuery = {}, signal?: AbortSignal, limit?: number) => {
  const search = new URLSearchParams();
  if (limit !== undefined) search.set("limit", String(limit));
  if (query.beforeSequence !== undefined) search.set("beforeSequence", String(query.beforeSequence));
  if (query.result) search.set("result", query.result);
  if (query.actionPrefix) search.set("actionPrefix", query.actionPrefix);
  if (query.actor) search.set("actor", query.actor);
  if (query.source) search.set("source", query.source);
  if (query.search) search.set("search", query.search);
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return requestJson<unknown>(`/audit${suffix}`, { signal })
  .then((payload) => AuditEventsResponseSchema.parse(payload));
};

export async function fetchAllAuditEvents(query: AuditEventsQuery = {}, signal?: AbortSignal): Promise<AuditEventsResponse> {
  let cursor: number | undefined;
  let firstPage: AuditEventsResponse | null = null;
  const events = new Map<string, AuditEvent>();
  do {
    const pageQuery: AuditEventsQuery = cursor === undefined ? query : { ...query, beforeSequence: cursor };
    const page = await fetchAuditEvents(
      pageQuery,
      signal,
      AUDIT_EXPORT_PAGE_LIMIT,
    );
    firstPage ??= page;
    for (const event of page.events) events.set(event.eventId, event);
    if (page.nextCursor === null) break;
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  const baseline = firstPage ?? await fetchAuditEvents(query, signal, AUDIT_EXPORT_PAGE_LIMIT);
  return {
    ...baseline,
    events: [...events.values()].sort((left, right) => right.sequence - left.sequence),
    nextCursor: null,
  };
}

export type { AuditEvent };
