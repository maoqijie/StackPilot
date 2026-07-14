import type Database from "better-sqlite3";
import type { SiteDesiredState, SiteOperation, SitePlan } from "@stackpilot/contracts";
import { SiteOperationSchema, SitePlanSchema } from "@stackpilot/contracts";
import { SecretStore } from "../../security/secretStore.js";

export type ManagedSiteState = {
  siteId: string;
  nodeId: string;
  domainDigest: string;
  desiredState: SiteDesiredState;
  protected: boolean;
  version: number;
  activeReleaseId: string | null;
  createdAt: string;
  updatedAt: string;
};
export type SitePlanExecutionSecrets = { certificateEmail: string; environmentVariables: Array<{ name: string; value: string }> };
export type SiteReleaseState = { releaseId: string; siteId: string; planId: string; status: string; createdAt: string; activatedAt: string | null };
type NodeScope = "all" | string[];

export interface SiteManagementRepository {
  findPlanByIdempotency(digest: string): SitePlan | null;
  getPlan(planId: string): SitePlan | null;
  listPlans(nodeScope: NodeScope): SitePlan[];
  savePlan(plan: SitePlan, idempotencyDigest: string, certificateEmail: string, environment: Array<{ name: string; value: string }>): void;
  savePlanWithOperation(plan: SitePlan, planDigest: string, certificateEmail: string, environment: Array<{ name: string; value: string }>, operation: SiteOperation, operationDigest: string): void;
  updatePlan(plan: SitePlan): void;
  getPlanExecutionSecrets(planId: string): SitePlanExecutionSecrets;
  findOperationByIdempotency(digest: string): SiteOperation | null;
  getOperation(operationId: string): SiteOperation | null;
  listDeploymentOperations(nodeScope: NodeScope): SiteOperation[];
  listNonTerminalOperations(): SiteOperation[];
  saveOperation(operation: SiteOperation, idempotencyDigest: string): void;
  updateOperation(operation: SiteOperation): void;
  getManagedSite(siteId: string): ManagedSiteState | null;
  findManagedSite(nodeId: string, domainDigest: string): ManagedSiteState | null;
  listManagedSites(): ManagedSiteState[];
  saveManagedSite(site: ManagedSiteState): void;
  saveRelease(releaseId: string, siteId: string, planId: string, createdAt: string): void;
  listReleases(nodeScope: NodeScope): SiteReleaseState[];
}

export class MemorySiteManagementRepository implements SiteManagementRepository {
  private plans = new Map<string, SitePlan>();
  private operations = new Map<string, SiteOperation>();
  private planKeys = new Map<string, string>();
  private operationKeys = new Map<string, string>();
  private sites = new Map<string, ManagedSiteState>();
  private environments = new Map<string, Array<{ name: string; value: string }>>();
  private certificateEmails = new Map<string, string>();
  private releases = new Map<string, SiteReleaseState>();
  findPlanByIdempotency(digest: string) { const id = this.planKeys.get(digest); return id ? structuredClone(this.plans.get(id) ?? null) : null; }
  getPlan(planId: string) { return structuredClone(this.plans.get(planId) ?? null); }
  listPlans(nodeScope: NodeScope) { return structuredClone([...this.plans.values()].filter((plan) => nodeScope === "all" || nodeScope.includes(plan.nodeId)).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 10_000)); }
  savePlan(plan: SitePlan, digest: string, certificateEmail: string, environment: Array<{ name: string; value: string }>) { this.plans.set(plan.planId, structuredClone(plan)); this.planKeys.set(digest, plan.planId); this.certificateEmails.set(plan.planId, certificateEmail); this.environments.set(plan.planId, structuredClone(environment)); }
  savePlanWithOperation(plan: SitePlan, planDigest: string, certificateEmail: string, environment: Array<{ name: string; value: string }>, operation: SiteOperation, operationDigest: string) { this.savePlan(plan, planDigest, certificateEmail, environment); this.saveOperation(operation, operationDigest); }
  updatePlan(plan: SitePlan) { this.plans.set(plan.planId, structuredClone(plan)); }
  getPlanExecutionSecrets(planId: string) { return { certificateEmail: this.certificateEmails.get(planId) ?? "", environmentVariables: structuredClone(this.environments.get(planId) ?? []) }; }
  findOperationByIdempotency(digest: string) { const id = this.operationKeys.get(digest); return id ? structuredClone(this.operations.get(id) ?? null) : null; }
  getOperation(operationId: string) { return structuredClone(this.operations.get(operationId) ?? null); }
  listDeploymentOperations(nodeScope: NodeScope) {
    const plans = this.plans;
    const latest = new Map<string, SiteOperation>();
    for (const operation of [...this.operations.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt))) {
      if (!operation.planId || !["prepare", "activate"].includes(operation.type) || latest.has(operation.planId) || nodeScope !== "all" && !nodeScope.includes(operation.nodeId)) continue;
      if (plans.get(operation.planId)?.nodeId === operation.nodeId) latest.set(operation.planId, operation);
    }
    return structuredClone([...latest.values()]);
  }
  listNonTerminalOperations() { return structuredClone([...this.operations.values()].filter((item) => !["succeeded", "failed", "cancelled"].includes(item.status))); }
  saveOperation(operation: SiteOperation, digest: string) { this.operations.set(operation.operationId, structuredClone(operation)); this.operationKeys.set(digest, operation.operationId); }
  updateOperation(operation: SiteOperation) { this.operations.set(operation.operationId, structuredClone(operation)); }
  getManagedSite(siteId: string) { return structuredClone(this.sites.get(siteId) ?? null); }
  findManagedSite(nodeId: string, domainDigest: string) { return structuredClone([...this.sites.values()].find((site) => site.nodeId === nodeId && site.domainDigest === domainDigest) ?? null); }
  listManagedSites() { return structuredClone([...this.sites.values()]); }
  saveManagedSite(site: ManagedSiteState) { this.sites.set(site.siteId, structuredClone(site)); }
  saveRelease(releaseId: string, siteId: string, planId: string, createdAt: string) { this.releases.set(releaseId, { releaseId, siteId, planId, status: "active", createdAt, activatedAt: createdAt }); }
  listReleases(nodeScope: NodeScope) { const plans = this.plans; return structuredClone([...this.releases.values()].filter((release) => { const plan = plans.get(release.planId); return plan && (nodeScope === "all" || nodeScope.includes(plan.nodeId)); }).sort((left, right) => (right.activatedAt ?? right.createdAt).localeCompare(left.activatedAt ?? left.createdAt)).slice(0, 10_000)); }
}

type PlanRow = { payload: string; deployment_environment: SitePlan["deploymentEnvironment"] };
type OperationRow = { payload: string; result: string | null };
type DeploymentOperationRow = OperationRow & { plan_id: string; node_id: string; operation_type: string };
type SiteRow = Record<string, unknown>;

export class SqliteSiteManagementRepository implements SiteManagementRepository {
  constructor(private readonly database: Database.Database, private readonly secrets: SecretStore) {}
  private plan(row: PlanRow | undefined) { return row ? SitePlanSchema.parse({ ...JSON.parse(row.payload), deploymentEnvironment: row.deployment_environment }) : null; }
  private operation(row: OperationRow | undefined) {
    if (!row) return null;
    const payload = JSON.parse(row.payload) as Record<string, unknown>;
    return SiteOperationSchema.parse({ ...payload, result: row.result ? JSON.parse(row.result) : null });
  }
  findPlanByIdempotency(digest: string) { return this.plan(this.database.prepare("SELECT payload,deployment_environment FROM site_plans WHERE idempotency_digest=?").get(digest) as PlanRow | undefined); }
  getPlan(planId: string) { return this.plan(this.database.prepare("SELECT payload,deployment_environment FROM site_plans WHERE plan_id=?").get(planId) as PlanRow | undefined); }
  listPlans(nodeScope: NodeScope) {
    if (nodeScope !== "all" && nodeScope.length === 0) return [];
    const scope = nodeScope === "all" ? { clause: "", values: [] } : { clause: ` WHERE node_id IN (${nodeScope.map(() => "?").join(",")})`, values: nodeScope };
    return (this.database.prepare(`SELECT payload,deployment_environment FROM site_plans${scope.clause} ORDER BY updated_at DESC,plan_id DESC LIMIT 10000`).all(...scope.values) as PlanRow[]).map((row) => this.plan(row)!);
  }
  savePlan(plan: SitePlan, digest: string, certificateEmail: string, environment: Array<{ name: string; value: string }>) {
    this.database.transaction(() => {
      this.database.prepare("INSERT INTO site_plans(plan_id,node_id,deployment_environment,payload,status,digest,idempotency_digest,version,created_at,updated_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
        .run(plan.planId, plan.nodeId, plan.deploymentEnvironment, JSON.stringify(plan), plan.status, plan.digest, digest, plan.version, plan.createdAt, plan.updatedAt, plan.expiresAt);
      const insert = this.database.prepare("INSERT INTO site_environment_references(plan_id,variable_name,secret_key) VALUES(?,?,?)");
      const emailKey = `site-plan:${plan.planId}:certificate-email`;
      this.secrets.set(emailKey, Buffer.from(certificateEmail));
      insert.run(plan.planId, "__certificate_email", emailKey);
      for (const entry of environment) {
        const secretKey = `site-plan:${plan.planId}:environment:${entry.name}`;
        this.secrets.set(secretKey, Buffer.from(entry.value));
        insert.run(plan.planId, entry.name, secretKey);
      }
    })();
  }
  savePlanWithOperation(plan: SitePlan, planDigest: string, certificateEmail: string, environment: Array<{ name: string; value: string }>, operation: SiteOperation, operationDigest: string) {
    this.database.transaction(() => {
      this.savePlan(plan, planDigest, certificateEmail, environment);
      this.saveOperation(operation, operationDigest);
    })();
  }
  updatePlan(plan: SitePlan) {
    this.database.prepare("UPDATE site_plans SET deployment_environment=?,payload=?,status=?,digest=?,version=?,updated_at=?,expires_at=? WHERE plan_id=?")
      .run(plan.deploymentEnvironment, JSON.stringify(plan), plan.status, plan.digest, plan.version, plan.updatedAt, plan.expiresAt, plan.planId);
  }
  getPlanExecutionSecrets(planId: string) {
    const rows = this.database.prepare("SELECT variable_name,secret_key FROM site_environment_references WHERE plan_id=? ORDER BY variable_name").all(planId) as Array<{ variable_name: string; secret_key: string }>;
    const values = rows.map((row) => {
      const value = this.secrets.get(row.secret_key);
      if (!value) throw new Error("Site plan environment secret is unavailable");
      return { name: row.variable_name, value: value.toString("utf8") };
    });
    const certificate = values.find((entry) => entry.name === "__certificate_email");
    if (!certificate) throw new Error("Site plan certificate contact is unavailable");
    return { certificateEmail: certificate.value, environmentVariables: values.filter((entry) => entry.name !== "__certificate_email") };
  }
  findOperationByIdempotency(digest: string) { return this.operation(this.database.prepare("SELECT payload,result FROM site_operations WHERE idempotency_digest=?").get(digest) as OperationRow | undefined); }
  getOperation(operationId: string) { return this.operation(this.database.prepare("SELECT payload,result FROM site_operations WHERE operation_id=?").get(operationId) as OperationRow | undefined); }
  listDeploymentOperations(nodeScope: NodeScope) {
    if (nodeScope !== "all" && nodeScope.length === 0) return [];
    const scope = nodeScope === "all" ? { clause: "", values: [] } : { clause: ` AND plans.node_id IN (${nodeScope.map(() => "?").join(",")})`, values: nodeScope };
    return (this.database.prepare(`SELECT operations.payload,operations.result,operations.plan_id,operations.node_id,operations.operation_type
      FROM site_operations operations
      JOIN site_plans plans ON plans.plan_id=operations.plan_id AND plans.node_id=operations.node_id
      WHERE operations.operation_type IN ('prepare','activate')${scope.clause} AND NOT EXISTS (
        SELECT 1 FROM site_operations newer
        WHERE newer.plan_id=operations.plan_id AND newer.operation_type IN ('prepare','activate')
          AND (newer.created_at>operations.created_at OR (newer.created_at=operations.created_at AND newer.operation_id>operations.operation_id))
      )
      ORDER BY operations.created_at DESC,operations.operation_id DESC LIMIT 10000`).all(...scope.values) as DeploymentOperationRow[]).flatMap((row) => {
      const operation = this.operation(row)!;
      return operation.planId === row.plan_id && operation.nodeId === row.node_id && operation.type === row.operation_type ? [operation] : [];
    });
  }
  listNonTerminalOperations() {
    return (this.database.prepare("SELECT payload,result FROM site_operations WHERE status NOT IN ('succeeded','failed','cancelled') ORDER BY created_at").all() as OperationRow[])
      .map((row) => this.operation(row)!);
  }
  saveOperation(operation: SiteOperation, digest: string) {
    this.database.prepare("INSERT INTO site_operations(operation_id,task_id,node_id,site_id,plan_id,operation_type,status,stage,progress_percent,payload,result,error_code,idempotency_digest,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(operation.operationId, operation.taskId, operation.nodeId, operation.siteId, operation.planId, operation.type, operation.status, operation.stage, operation.progressPercent, JSON.stringify(operation), operation.result ? JSON.stringify(operation.result) : null, operation.errorCode, digest, operation.createdAt, operation.updatedAt);
  }
  updateOperation(operation: SiteOperation) {
    this.database.prepare("UPDATE site_operations SET task_id=?,status=?,stage=?,progress_percent=?,result=?,error_code=?,updated_at=?,payload=? WHERE operation_id=?")
      .run(operation.taskId, operation.status, operation.stage, operation.progressPercent, operation.result ? JSON.stringify(operation.result) : null, operation.errorCode, operation.updatedAt, JSON.stringify(operation), operation.operationId);
  }
  private site(row: SiteRow | undefined): ManagedSiteState | null {
    return row ? { siteId: row.site_id as string, nodeId: row.node_id as string, domainDigest: row.domain_digest as string, desiredState: row.desired_state as SiteDesiredState, protected: Boolean(row.protected), version: row.version as number, activeReleaseId: row.active_release_id as string | null, createdAt: row.created_at as string, updatedAt: row.updated_at as string } : null;
  }
  getManagedSite(siteId: string) { return this.site(this.database.prepare("SELECT * FROM managed_sites WHERE site_id=?").get(siteId) as SiteRow | undefined); }
  findManagedSite(nodeId: string, domainDigest: string) { return this.site(this.database.prepare("SELECT * FROM managed_sites WHERE node_id=? AND domain_digest=?").get(nodeId, domainDigest) as SiteRow | undefined); }
  listManagedSites() { return (this.database.prepare("SELECT * FROM managed_sites").all() as SiteRow[]).map((row) => this.site(row)!); }
  saveManagedSite(site: ManagedSiteState) {
    this.database.prepare("INSERT INTO managed_sites(site_id,node_id,domain_digest,desired_state,protected,version,active_release_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(site_id) DO UPDATE SET desired_state=excluded.desired_state,protected=excluded.protected,version=excluded.version,active_release_id=excluded.active_release_id,updated_at=excluded.updated_at")
      .run(site.siteId, site.nodeId, site.domainDigest, site.desiredState, Number(site.protected), site.version, site.activeReleaseId, site.createdAt, site.updatedAt);
  }
  saveRelease(releaseId: string, siteId: string, planId: string, createdAt: string) {
    this.database.prepare("INSERT INTO site_releases(release_id,site_id,plan_id,status,created_at,activated_at) VALUES(?,?,?,?,?,?)")
      .run(releaseId, siteId, planId, "active", createdAt, createdAt);
  }
  listReleases(nodeScope: NodeScope) {
    if (nodeScope !== "all" && nodeScope.length === 0) return [];
    const scope = nodeScope === "all" ? { clause: "", values: [] } : { clause: ` WHERE plans.node_id IN (${nodeScope.map(() => "?").join(",")})`, values: nodeScope };
    return this.database.prepare(`SELECT releases.release_id AS releaseId,releases.site_id AS siteId,releases.plan_id AS planId,releases.status,releases.created_at AS createdAt,releases.activated_at AS activatedAt FROM site_releases releases JOIN site_plans plans ON plans.plan_id=releases.plan_id${scope.clause} ORDER BY COALESCE(releases.activated_at,releases.created_at) DESC,releases.release_id DESC LIMIT 10000`).all(...scope.values) as SiteReleaseState[];
  }
}
