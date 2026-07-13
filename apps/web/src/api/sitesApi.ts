import { SiteRuntimePayloadSchema } from "@stackpilot/contracts";
import type { SiteRuntimePayload } from "@stackpilot/contracts";
import { requestJson } from "./client";

export type { SiteRuntimePayload, SiteRuntimeRecord } from "@stackpilot/contracts";

export function fetchSites(signal?: AbortSignal) {
  return requestJson<SiteRuntimePayload>("/sites", { signal }).then((payload) => SiteRuntimePayloadSchema.parse(payload));
}
