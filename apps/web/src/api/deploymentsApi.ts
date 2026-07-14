import {
  CreateSiteRollbackRequestSchema,
  DeploymentPayloadSchema,
  SiteOperationSchema,
  SiteRollbackPayloadSchema,
} from "@stackpilot/contracts";
import type {
  CreateSiteRollbackRequest,
  DeploymentPayload,
  SiteOperation,
  SiteRollbackPayload,
  SiteRollbackRecord,
} from "@stackpilot/contracts";
import { requestJson } from "./client";

export type {
  DeploymentPayload,
  DeploymentRecord,
  DeploymentReleaseRecord,
} from "@stackpilot/contracts";
export type { SiteRollbackPayload, SiteRollbackRecord };

export function fetchDeployments(signal?: AbortSignal) {
  return requestJson<DeploymentPayload>("/deployments", { signal })
    .then((payload) => DeploymentPayloadSchema.parse(payload));
}

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
