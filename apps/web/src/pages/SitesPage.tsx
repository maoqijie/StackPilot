import type { Permission } from "@stackpilot/contracts";
import type { Notify, PageKey } from "../types/app";
import { CertificateRenewalPage } from "../features/sites/CertificateRenewalPage";
import { SitesMonitoringView } from "../features/sites/SitesMonitoringView";

const defaultPermissions: Permission[] = ["sites:read", "sites:renew"];

function SitesPage({ page, notify, permissions = defaultPermissions }: { page: PageKey; notify: Notify; permissions?: Permission[] }) {
  return page === "sites-cert"
    ? <CertificateRenewalPage notify={notify} canRenew={permissions.includes("sites:renew")} />
    : <SitesMonitoringView page={page} />;
}

export { SitesPage };
