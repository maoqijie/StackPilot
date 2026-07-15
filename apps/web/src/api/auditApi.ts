import { AuditEventsResponseSchema, AuditExportCreateResponseSchema, AuditExportListResponseSchema, CreateAuditExportRequestSchema } from "@stackpilot/contracts";
import type { AuditEvent, AuditExportRecord, CreateAuditExportRequest } from "@stackpilot/contracts";
import { getCsrfToken, requestJson, responseError } from "./client";

export const fetchAuditEvents = (signal?: AbortSignal) => requestJson<unknown>("/audit", { signal })
  .then((payload) => AuditEventsResponseSchema.parse(payload).events);

export const fetchAuditExports = (signal?: AbortSignal) => requestJson<unknown>("/audit-exports", { signal })
  .then((payload) => AuditExportListResponseSchema.parse(payload));

export const createAuditExport = (input: CreateAuditExportRequest, reauthProof: string) => requestJson<unknown>("/audit-exports", {
  method: "POST",
  headers: { "X-Reauth-Proof": reauthProof },
  body: JSON.stringify(CreateAuditExportRequestSchema.parse(input)),
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

export type { AuditEvent, AuditExportRecord };
