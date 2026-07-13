import {
  CertificateRenewalBatchSchema, CreateCertificateRenewalRequestSchema, SiteRuntimePayloadSchema,
} from "@stackpilot/contracts";
import type {
  CertificateRenewalBatch, CreateCertificateRenewalRequest, SiteRuntimePayload,
} from "@stackpilot/contracts";
import { requestJson } from "./client";

export type { CertificateRenewalBatch, SiteRuntimePayload, SiteRuntimeRecord } from "@stackpilot/contracts";

export function fetchSites(signal?: AbortSignal) {
  return requestJson<SiteRuntimePayload>("/sites", { signal }).then((payload) => SiteRuntimePayloadSchema.parse(payload));
}

export function createCertificateRenewal(payload: CreateCertificateRenewalRequest, reauthProof: string) {
  const input = CreateCertificateRenewalRequestSchema.parse(payload);
  return requestJson<CertificateRenewalBatch>("/sites/certificate-renewals", {
    method: "POST",
    headers: { "X-Reauth-Proof": reauthProof },
    body: JSON.stringify(input),
  }).then((result) => CertificateRenewalBatchSchema.parse(result));
}

export function fetchCertificateRenewal(batchId: string, signal?: AbortSignal) {
  return requestJson<CertificateRenewalBatch>(`/sites/certificate-renewals/${encodeURIComponent(batchId)}`, { signal })
    .then((result) => CertificateRenewalBatchSchema.parse(result));
}
