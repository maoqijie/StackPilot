import { DeploymentPayloadSchema } from "@stackpilot/contracts";
import type { DeploymentPayload } from "@stackpilot/contracts";
import { requestJson } from "./client";

export type { DeploymentPayload, DeploymentRecord, DeploymentReleaseRecord } from "@stackpilot/contracts";

export function fetchDeployments(signal?: AbortSignal) {
  return requestJson<DeploymentPayload>("/deployments", { signal }).then((payload) => DeploymentPayloadSchema.parse(payload));
}
