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
export type SiteReleaseRecord = {
  releaseId: string; siteId: string; planId: string; nodeId: string; domain: string;
  repositoryRef: string; createdAt: string; activatedAt: string | null;
};

export interface SiteManagementRepository {
  findPlanByIdempotency(digest: string): SitePlan | null;
  getPlan(planId: string): SitePlan | null;
  savePlan(plan: SitePlan, idempotencyDigest: string, certificateEmail: string, environment: Array<{ name: string; value: string }>): void;
  savePlanWithOperation(plan: SitePlan, planDigest: string, certificateEmail: string, environment: Array<{ name: string; value: string }>, operation: SiteOperation, operationDigest: string): void;
  updatePlan(plan: SitePlan): void;
  getPlanExecutionSecrets(planId: string): SitePlanExecutionSecrets;
  findOperationByIdempotency(digest: string): SiteOperation | null;
  getOperation(operationId: string): SiteOperation | null;
  listNonTerminalOperations(): SiteOperation[];
  saveOperation(operation: SiteOperation, idempotencyDigest: string): void;
  updateOperation(operation: SiteOperation): void;
  listRollbackOperations(): SiteOperation[];
  getManagedSite(siteId: string): ManagedSiteState | null;
  findManagedSite(nodeId: string, domainDigest: string): ManagedSiteState | null;
  listManagedSites(): ManagedSiteState[];
  saveManagedSite(site: ManagedSiteState): void;
  saveRelease(releaseId: string, siteId: string, planId: string, createdAt: string): void;
  getRelease(releaseId: string): SiteReleaseRecord | null;
  listReleases(): SiteReleaseRecord[];
  completeRollback(operation: SiteOperation, site: ManagedSiteState): void;
}

export class MemorySiteManagementRepository implements SiteManagementRepository {
  private plans = new Map<string, SitePlan>();
  private operations = new Map<string, SiteOperation>();
  private planKeys = new Map<string, string>();
  private operationKeys = new Map<string, string>();
  private sites = new Map<string, ManagedSiteState>();
  private environments = new Map<string, Array<{ name: string; value: string }>>();
  private certificateEmails = new Map<string, string>();
  findPlanByIdempotency(digest: string) { const id = this.planKeys.get(digest); return id ? structuredClone(this.plans.get(id) ?? null) : null; }
  getPlan(planId: string) { return structuredClone(this.plans.get(planId) ?? null); }
  savePlan(plan: SitePlan, digest: string, certificateEmail: string, environment: Array<{ name: string; value: string }>) { this.plans.set(plan.planId, structuredClone(plan)); this.planKeys.set(digest, plan.planId); this.certificateEmails.set(plan.planId, certificateEmail); this.environments.set(plan.planId, structuredClone(environment)); }
  savePlanWithOperation(plan: SitePlan, planDigest: string, certificateEmail: string, environment: Array<{ name: string; value: string }>, operation: SiteOperation, operationDigest: string) { this.savePlan(plan, planDigest, certificateEmail, environment); this.saveOperation(operation, operationDigest); }
  updatePlan(plan: SitePlan) { this.plans.set(plan.planId, structuredClone(plan)); }
  getPlanExecutionSecrets(planId: string) { return { certificateEmail: this.certificateEmails.get(planId) ?? "", environmentVariables: structuredClone(this.environments.get(planId) ?? []) }; }
  findOperationByIdempotency(digest: string) { const id = this.operationKeys.get(digest); return id ? structuredClone(this.operations.get(id) ?? null) : null; }
  getOperation(operationId: string) { return structuredClone(this.operations.get(operationId) ?? null); }
  listNonTerminalOperations() { return structuredClone([...this.operations.values()].filter((item) => !["succeeded", "failed", "cancelled"].includes(item.status))); }
  saveOperation(operation: SiteOperation, digest: string) { this.operations.set(operation.operationId, structuredClone(operation)); this.operationKeys.set(digest, operation.operationId); }
  updateOperation(operation: SiteOperation) { this.operations.set(operation.operationId, structuredClone(operation)); }
  listRollbackOperations() { return structuredClone([...this.operations.values()].filter((item) => item.type === "rollback")); }
  getManagedSite(siteId: string) { return structuredClone(this.sites.get(siteId) ?? null); }
  findManagedSite(nodeId: string, domainDigest: string) { return structuredClone([...this.sites.values()].find((site) => site.nodeId === nodeId && site.domainDigest === domainDigest) ?? null); }
  listManagedSites() { return structuredClone([...this.sites.values()]); }
  saveManagedSite(site: ManagedSiteState) { this.sites.set(site.siteId, structuredClone(site)); }
  private releases = new Map<string, SiteReleaseRecord>();
  saveRelease(releaseId: string, siteId: string, planId: string, createdAt: string) {
    const plan = this.plans.get(planId); const site = this.sites.get(siteId);
    if (plan && site) this.releases.set(releaseId, { releaseId, siteId, planId, nodeId: site.nodeId, domain: plan.domains[0]!, repositoryRef: plan.repositoryRef, createdAt, activatedAt: createdAt });
  }
  getRelease(releaseId: string) { return structuredClone(this.releases.get(releaseId) ?? null); }
  listReleases() { return structuredClone([...this.releases.values()]); }
  completeRollback(operation: SiteOperation, site: ManagedSiteState) { this.updateOperation(operation); this.saveManagedSite(site); }
}

type PlanRow = { payload: string };
type OperationRow = { payload: string; result: string | null };
type SiteRow = Record<string, unknown>;
type ReleaseRow = { release_id: string; site_id: string; plan_id: string; node_id: string; payload: string; created_at: string; activated_at: string | null };

export class SqliteSiteManagementRepository implements SiteManagementRepository {
  constructor(private readonly database: Database.Database, private readonly secrets: SecretStore) {}
  private plan(row: PlanRow | undefined) { return row ? SitePlanSchema.parse(JSON.parse(row.payload)) : null; }
  private operation(row: OperationRow | undefined) {
    if (!row) return null;
    const payload = JSON.parse(row.payload) as Record<string, unknown>;
    return SiteOperationSchema.parse({ ...payload, result: row.result ? JSON.parse(row.result) : null });
  }
  findPlanByIdempotency(digest: string) { return this.plan(this.database.prepare("SELECT payload FROM site_plans WHERE idempotency_digest=?").get(digest) as PlanRow | undefined); }
  getPlan(planId: string) { return this.plan(this.database.prepare("SELECT payload FROM site_plans WHERE plan_id=?").get(planId) as PlanRow | undefined); }
  savePlan(plan: SitePlan, digest: string, certificateEmail: string, environment: Array<{ name: string; value: string }>) {
    this.database.transaction(() => {
      this.database.prepare("INSERT INTO site_plans(plan_id,node_id,payload,status,digest,idempotency_digest,version,created_at,updated_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
        .run(plan.planId, plan.nodeId, JSON.stringify(plan), plan.status, plan.digest, digest, plan.version, plan.createdAt, plan.updatedAt, plan.expiresAt);
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
    this.database.prepare("UPDATE site_plans SET payload=?,status=?,digest=?,version=?,updated_at=?,expires_at=? WHERE plan_id=?")
      .run(JSON.stringify(plan), plan.status, plan.digest, plan.version, plan.updatedAt, plan.expiresAt, plan.planId);
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
  listRollbackOperations() {
    return (this.database.prepare("SELECT payload,result FROM site_operations WHERE operation_type='rollback' ORDER BY created_at DESC").all() as OperationRow[])
      .map((row) => this.operation(row)!);
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
  private release(row: ReleaseRow | undefined): SiteReleaseRecord | null {
    if (!row) return null;
    const plan = SitePlanSchema.parse(JSON.parse(row.payload));
    return { releaseId: row.release_id, siteId: row.site_id, planId: row.plan_id, nodeId: row.node_id, domain: plan.domains[0]!, repositoryRef: plan.repositoryRef, createdAt: row.created_at, activatedAt: row.activated_at };
  }
  getRelease(releaseId: string) {
    return this.release(this.database.prepare("SELECT r.release_id,r.site_id,r.plan_id,s.node_id,p.payload,r.created_at,r.activated_at FROM site_releases r JOIN managed_sites s ON s.site_id=r.site_id JOIN site_plans p ON p.plan_id=r.plan_id WHERE r.release_id=?").get(releaseId) as ReleaseRow | undefined);
  }
  listReleases() {
    return (this.database.prepare("SELECT r.release_id,r.site_id,r.plan_id,s.node_id,p.payload,r.created_at,r.activated_at FROM site_releases r JOIN managed_sites s ON s.site_id=r.site_id JOIN site_plans p ON p.plan_id=r.plan_id ORDER BY r.created_at DESC").all() as ReleaseRow[])
      .map((row) => this.release(row)!);
  }
  completeRollback(operation: SiteOperation, site: ManagedSiteState) {
    this.database.transaction(() => {
      this.updateOperation(operation);
      this.saveManagedSite(site);
      this.database.prepare("UPDATE site_releases SET status='available' WHERE site_id=?").run(site.siteId);
      this.database.prepare("UPDATE site_releases SET status='active',activated_at=? WHERE release_id=? AND site_id=?").run(operation.updatedAt, site.activeReleaseId, site.siteId);
    })();
  }
}
