import {
  ActivateSitePlanRequestSchema,
  CertificateRenewalBatchSchema,
  CreateSiteLogQueryRequestSchema,
  CreateSitePlanRequestSchema,
  CreateCertificateRenewalRequestSchema,
  SiteOperationSchema,
  SitePlanSchema,
  SiteRuntimePayloadSchema,
  UpdateSiteLifecycleRequestSchema,
} from "@stackpilot/contracts";
import type {
  ActivateSitePlanRequest, CertificateRenewalBatch, CreateCertificateRenewalRequest, CreateSiteLogQueryRequest,
  CreateSitePlanRequest, SiteOperation, SitePlan, SiteRuntimePayload, UpdateSiteLifecycleRequest,
} from "@stackpilot/contracts";
import { requestJson } from "./client";

export type { CertificateRenewalBatch, SiteRuntimePayload, SiteRuntimeRecord } from "@stackpilot/contracts";
export type { SiteOperation, SitePlan } from "@stackpilot/contracts";

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

export function createSitePlan(payload: CreateSitePlanRequest, reauthProof: string) {
  return requestJson<SitePlan>("/site-plans", { method: "POST", headers: { "X-Reauth-Proof": reauthProof }, body: JSON.stringify(CreateSitePlanRequestSchema.parse(payload)) }).then((result) => SitePlanSchema.parse(result));
}

export function activateSitePlan(planId: string, payload: ActivateSitePlanRequest, reauthProof: string) {
  return requestJson<SiteOperation>(`/site-plans/${encodeURIComponent(planId)}/activate`, { method: "POST", headers: { "X-Reauth-Proof": reauthProof }, body: JSON.stringify(ActivateSitePlanRequestSchema.parse(payload)) }).then((result) => SiteOperationSchema.parse(result));
}

export function updateSiteLifecycle(siteId: string, payload: UpdateSiteLifecycleRequest, reauthProof: string) {
  return requestJson<SiteOperation>(`/sites/${encodeURIComponent(siteId)}`, { method: "PATCH", headers: { "X-Reauth-Proof": reauthProof }, body: JSON.stringify(UpdateSiteLifecycleRequestSchema.parse(payload)) }).then((result) => SiteOperationSchema.parse(result));
}

export function querySiteLogs(siteId: string, payload: CreateSiteLogQueryRequest) {
  return requestJson<SiteOperation>(`/sites/${encodeURIComponent(siteId)}/log-queries`, { method: "POST", body: JSON.stringify(CreateSiteLogQueryRequestSchema.parse(payload)) }).then((result) => SiteOperationSchema.parse(result));
}

export function fetchSiteOperation(operationId: string, signal?: AbortSignal) {
  return requestJson<SiteOperation>(`/site-operations/${encodeURIComponent(operationId)}`, { signal }).then((result) => SiteOperationSchema.parse(result));
}
