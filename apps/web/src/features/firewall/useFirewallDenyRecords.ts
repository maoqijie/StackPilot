import type { FirewallDenyRecordsPayload } from "@stackpilot/contracts";
import { fetchFirewallDenyRecords } from "../../api/firewallApi";
import { usePollingResource } from "../../hooks/usePollingResource";

export function useFirewallDenyRecords(initialPayload: FirewallDenyRecordsPayload | null = null) {
  return usePollingResource((signal) => fetchFirewallDenyRecords(signal), initialPayload);
}
