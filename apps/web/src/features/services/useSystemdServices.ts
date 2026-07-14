import type { SystemdServicesPayload } from "@stackpilot/contracts";
import { fetchSystemdServices } from "../../api/systemdApi";
import { usePollingResource } from "../../hooks/usePollingResource";

export function useSystemdServices(initialPayload: SystemdServicesPayload | null = null) {
  return usePollingResource((signal) => fetchSystemdServices(signal), initialPayload);
}
