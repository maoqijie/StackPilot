import { fetchFirewallOpenPorts } from "../../api/firewallApi";
import { usePollingResource } from "../../hooks/usePollingResource";

export function useFirewallOpenPorts(enabled = true) {
  return usePollingResource((signal) => fetchFirewallOpenPorts(signal), null, enabled, "firewall-open-ports");
}
