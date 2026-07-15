import type { FirewallRulesPayload } from "@stackpilot/contracts";
import { fetchFirewallRules } from "../../api/firewallApi";
import { usePollingResource } from "../../hooks/usePollingResource";

export function useFirewallRules(initialPayload: FirewallRulesPayload | null = null) {
  return usePollingResource((signal) => fetchFirewallRules(signal), initialPayload, true, "firewall-rules");
}
