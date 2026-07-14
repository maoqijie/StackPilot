import { SiteRollbackPayloadSchema } from "@stackpilot/contracts";
import type { SiteAccess } from "./siteMonitoringService.js";
import type { SiteManagementRepository } from "./siteManagementRepository.js";

const terminal = new Set(["succeeded", "failed", "cancelled"]);

export function projectSiteRollbacks(repository: SiteManagementRepository, access: SiteAccess) {
  const allowed = (nodeId: string) => access.nodeScope === "all" || access.nodeScope.includes(nodeId);
  const sites = new Map(repository.listManagedSites().filter((site) => allowed(site.nodeId)).map((site) => [site.siteId, site]));
  const releases = repository.listReleases(access.nodeScope).flatMap((release) => {
    const plan = repository.getPlan(release.planId);
    if (!plan || !sites.has(release.siteId) || plan.nodeId !== sites.get(release.siteId)?.nodeId) return [];
    return [{ release, plan }];
  });
  const releaseById = new Map(releases.map((entry) => [entry.release.releaseId, entry]));
  const operations = repository.listRollbackOperations().filter((item) => allowed(item.nodeId) && item.siteId && item.rollback);
  const pendingTargets = new Set(operations.filter((item) => !terminal.has(item.status)).map((item) => item.rollback!.targetReleaseId));
  const available = releases.flatMap(({ release, plan }) => {
    const site = sites.get(release.siteId);
    if (!site?.activeReleaseId || release.releaseId === site.activeReleaseId || pendingTargets.has(release.releaseId)) return [];
    return [{ id: release.releaseId, siteId: release.siteId, nodeId: site.nodeId, domain: plan.domains[0]!,
      currentReleaseId: site.activeReleaseId, targetReleaseId: release.releaseId, targetPlanId: release.planId,
      repositoryRef: plan.repositoryRef, status: "available" as const, requestedBy: null, reason: null,
      createdAt: release.createdAt, updatedAt: release.activatedAt ?? release.createdAt,
      progressPercent: 0, errorCode: null, siteVersion: site.version }];
  });
  const history = operations.flatMap((item) => {
    const target = releaseById.get(item.rollback!.targetReleaseId);
    const site = sites.get(item.siteId!);
    if (!target || !site) return [];
    return [{ id: item.operationId, siteId: item.siteId!, nodeId: item.nodeId, domain: target.plan.domains[0]!,
      currentReleaseId: item.rollback!.fromReleaseId, targetReleaseId: item.rollback!.targetReleaseId,
      targetPlanId: target.release.planId, repositoryRef: target.plan.repositoryRef, status: item.status,
      requestedBy: item.rollback!.requestedBy, reason: item.rollback!.reason, createdAt: item.createdAt,
      updatedAt: item.updatedAt, progressPercent: item.progressPercent, errorCode: item.errorCode,
      siteVersion: item.result?.siteVersion ?? site.version }];
  });
  return SiteRollbackPayloadSchema.parse({ collectedAt: new Date().toISOString(), rollbacks: [...history, ...available] });
}
