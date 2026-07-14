import {
  CreateSiteRollbackRequestSchema,
  SiteOperationSchema,
  SiteRollbackPayloadSchema,
} from "@stackpilot/contracts";
import type {
  CreateSiteRollbackRequest,
  SiteOperation,
  SiteRollbackPayload,
  SiteRollbackRecord,
} from "@stackpilot/contracts";
import { requestJson } from "./client";

export type { SiteRollbackPayload, SiteRollbackRecord };

export function fetchSiteRollbacks(signal?: AbortSignal) {
  return requestJson<SiteRollbackPayload>("/site-rollbacks", { signal })
    .then((payload) => SiteRollbackPayloadSchema.parse(payload));
}

export function createSiteRollback(
  siteId: string,
  payload: CreateSiteRollbackRequest,
  reauthProof: string,
) {
  const input = CreateSiteRollbackRequestSchema.parse(payload);
  return requestJson<SiteOperation>(`/sites/${encodeURIComponent(siteId)}/rollbacks`, {
    method: "POST",
    headers: { "X-Reauth-Proof": reauthProof },
    body: JSON.stringify(input),
  }).then((operation) => SiteOperationSchema.parse(operation));
}
