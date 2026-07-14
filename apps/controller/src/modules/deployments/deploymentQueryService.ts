import { DeploymentPayloadSchema } from "@stackpilot/contracts";
import type { DeploymentRecord, SiteOperation, SitePlan } from "@stackpilot/contracts";
import type { SiteAccess } from "../sites/siteMonitoringService.js";
import type { SiteManagementRepository } from "../sites/siteManagementRepository.js";

const terminal = new Set<SiteOperation["status"]>(["succeeded", "failed", "cancelled"]);

function deploymentStatus(plan: SitePlan, operation: SiteOperation): DeploymentRecord["status"] {
  if (plan.status === "activated") return "succeeded";
  if (plan.status === "failed" || operation.status === "failed" || operation.status === "cancelled") return "failed";
  if (plan.status === "expired" || Date.parse(plan.expiresAt) <= Date.now()) return "expired";
  if (plan.status === "activating" || operation.type === "activate" && !terminal.has(operation.status)) return "deploying";
  if (plan.status === "ready") return "ready";
  if (plan.status === "preparing" || operation.status === "running") return "preparing";
  return "queued";
}

export class DeploymentQueryService {
  constructor(private readonly repository: SiteManagementRepository) {}

  list(access: SiteAccess) {
    const plans = this.repository.listPlans(access.nodeScope);
    const operations = this.repository.listDeploymentOperations(access.nodeScope);
    const operationsByPlan = new Map<string, SiteOperation[]>();
    for (const operation of operations) {
      if (!operation.planId || !["prepare", "activate"].includes(operation.type)) continue;
      const current = operationsByPlan.get(operation.planId) ?? [];
      current.push(operation); operationsByPlan.set(operation.planId, current);
    }
    const releases = this.repository.listReleases(access.nodeScope);
    const releasesByPlan = new Map(releases.map((release) => [release.planId, release]));
    const deployments = plans.flatMap((plan) => {
      const planOperations = (operationsByPlan.get(plan.planId) ?? [])
        .filter((candidate) => candidate.planId === plan.planId && candidate.nodeId === plan.nodeId);
      const operation = planOperations[0];
      if (!operation) return [];
      const release = releasesByPlan.get(plan.planId);
      return [{
        id: operation.operationId, planId: plan.planId, operationId: operation.operationId, nodeId: plan.nodeId,
        siteId: release?.siteId ?? operation.siteId, domains: plan.domains, repositoryUrl: plan.repositoryUrl,
        repositoryRef: plan.repositoryRef, environment: plan.deploymentEnvironment, certificateEnvironment: plan.certificateEnvironment,
        runtime: plan.preview?.runtime ?? null, healthCheckPath: plan.preview?.healthCheckPath ?? null,
        status: deploymentStatus(plan, operation), stage: operation.stage, progressPercent: operation.progressPercent,
        errorCode: operation.errorCode, releaseId: release?.releaseId ?? operation.result?.releaseId ?? null,
        operator: plan.operator, createdAt: plan.createdAt, updatedAt: [plan.updatedAt, operation.updatedAt].sort().at(-1)!,
      } satisfies DeploymentRecord];
    });
    const allPlansById = new Map(plans.map((plan) => [plan.planId, plan]));
    const managedBySite = new Map(this.repository.listManagedSites().map((site) => [site.siteId, site]));
    return DeploymentPayloadSchema.parse({
      collectedAt: new Date().toISOString(), deployments,
      releases: releases.flatMap((release) => {
        const plan = allPlansById.get(release.planId); if (!plan) return [];
        return [{ ...release, nodeId: plan.nodeId, domains: plan.domains, repositoryRef: plan.repositoryRef,
          environment: plan.deploymentEnvironment, status: managedBySite.get(release.siteId)?.activeReleaseId === release.releaseId ? "active" as const : "historical" as const }];
      }),
    });
  }
}
