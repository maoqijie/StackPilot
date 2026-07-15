import { fetchFirewallOpenPorts } from "../../api/firewallApi";
import { usePollingResource } from "../../hooks/usePollingResource";

export function useFirewallOpenPorts(enabled = true) {
  return usePollingResource(fetchFirewallOpenPorts, null, enabled, "firewall-open-ports");
}
