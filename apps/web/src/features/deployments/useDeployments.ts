import { useCallback } from "react";
import { fetchDeployments } from "../../api/deploymentsApi";
import { usePollingResource } from "../../hooks/usePollingResource";

export function useDeployments(enabled = true) {
  const load = useCallback((signal: AbortSignal) => fetchDeployments(signal), []);
  return usePollingResource(load, null, enabled, "deployments");
}
