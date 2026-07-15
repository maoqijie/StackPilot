import type { FirewallRulesPayload } from "@stackpilot/contracts";
import { fetchFirewallRules } from "../../api/firewallApi";
import { usePollingResource } from "../../hooks/usePollingResource";

export function useFirewallRules(enabled: boolean, initialPayload: FirewallRulesPayload | null = null) {
  return usePollingResource((signal) => fetchFirewallRules(signal), initialPayload, enabled, "firewall-rules");
}
