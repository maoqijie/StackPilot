import { useCallback, useEffect } from "react";
import type { FirewallPayload } from "@stackpilot/contracts";
import { fetchFirewall } from "../../api/firewallApi";
import { usePollingResource } from "../../hooks/usePollingResource";

export function useFirewallData(enabled: boolean, onReconcile?: (data: FirewallPayload) => void) {
  const loader = useCallback((signal: AbortSignal) => fetchFirewall(signal), []);
  const resource = usePollingResource(loader, null, enabled);
  useEffect(() => { if (resource.data) onReconcile?.(resource.data); }, [onReconcile, resource.data]);
  return resource;
}
