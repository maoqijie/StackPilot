import { fetchAuditExports } from "../../api/auditApi";
import { usePollingResource } from "../../hooks/usePollingResource";

export function useAuditExports(enabled: boolean) {
  return usePollingResource(fetchAuditExports, null, enabled);
}

export type AuditExportsResource = ReturnType<typeof useAuditExports>;
