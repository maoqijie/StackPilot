import { AuditEventsResponseSchema, AuditExportCreateResponseSchema, AuditExportListResponseSchema, CreateAuditExportRequestSchema } from "@stackpilot/contracts";
import type { AuditEvent, AuditEventsQuery, AuditEventsResponse, AuditExportRecord, CreateAuditExportRequest } from "@stackpilot/contracts";
import { getCsrfToken, requestJson, responseError } from "./client";

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

export const fetchAuditExports = (signal?: AbortSignal) => requestJson<unknown>("/audit-exports", { signal })
  .then((payload) => AuditExportListResponseSchema.parse(payload));

export const createAuditExport = (input: CreateAuditExportRequest, reauthProof: string) => requestJson<unknown>("/audit-exports", {
  method: "POST", headers: { "X-Reauth-Proof": reauthProof }, body: JSON.stringify(CreateAuditExportRequestSchema.parse(input)),
}).then((payload) => AuditExportCreateResponseSchema.parse(payload).export);

export const retryAuditExport = (id: string, reauthProof: string) => requestJson<unknown>(`/audit-exports/${encodeURIComponent(id)}/retry`, {
  method: "POST", headers: { "X-Reauth-Proof": reauthProof }, body: "{}",
}).then((payload) => AuditExportCreateResponseSchema.parse(payload).export);

export async function downloadAuditExport(record: AuditExportRecord, reauthProof: string): Promise<void> {
  const response = await fetch(`/api/audit-exports/${encodeURIComponent(record.id)}/download`, {
    method: "POST", credentials: "include", body: "{}",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken(), "X-Reauth-Proof": reauthProof },
  });
  if (!response.ok) throw await responseError(response);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a"); link.href = url; link.download = `${record.name}.${record.format}`; link.click();
  URL.revokeObjectURL(url);
}

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

export type { AuditEvent, AuditEventsResponse, AuditExportRecord };
