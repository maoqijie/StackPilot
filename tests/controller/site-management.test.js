import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { IdentityService } from "../../apps/controller/dist/identity/identityService.js";
import { SiteManagementService } from "../../apps/controller/dist/modules/sites/siteManagementService.js";
import { SqliteSiteManagementRepository } from "../../apps/controller/dist/modules/sites/siteManagementRepository.js";
import { SecretStore } from "../../apps/controller/dist/security/secretStore.js";
import { createControllerServices } from "../../apps/controller/dist/app.js";
import { createStackPilotServer } from "../../apps/controller/dist/server.js";
import { loadControllerConfig } from "../../apps/controller/dist/config/environment.js";
import { MemoryAgentControlRepository } from "../../apps/controller/dist/repositories/agentControlRepository.js";
import { SqliteAgentControlRepository } from "../../apps/controller/dist/repositories/sqliteAgentControlRepository.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";

const emptyResult = (preview = null) => ({ message: null, siteId: null, releaseId: null, stagingId: null, desiredState: null, certificateRenewalBatchId: null, planPreview: preview, logs: [] });
const planInput = { nodeId: "node-local", domains: ["app.example.com"], repositoryUrl: "https://github.com/example/project.git", repositoryRef: "main", certificateEmail: "operator@example.com", environmentVariables: [{ name: "API_MODE", value: "production" }], idempotencyKey: "create-site-001" };
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const managedSiteId = (nodeId, domain) => {
  const agentSiteId = `site_${sha256(`${nodeId}\0${domain.toLowerCase()}`).slice(0, 32)}`;
  return `site-${sha256(`${nodeId}\0${agentSiteId}`).slice(0, 32)}`;
};

function managementFixture(database, executorOverride, sites = []) {
  const repository = new SqliteSiteManagementRepository(database, new SecretStore(database, Buffer.alloc(32, 7)));
  const dispatched = [];
  const executor = executorOverride ?? { dispatch: async (operationId, nodeId, instruction) => { dispatched.push({ operationId, nodeId, instruction }); return crypto.randomUUID(); }, reconcile: async () => null };
  const monitoring = { getSites: async () => ({ collectedAt: new Date().toISOString(), collectionStatus: "complete", warnings: [], sites }) };
  const renewals = { create: async () => { throw new Error("unused"); }, get: async () => { throw new Error("unused"); } };
  return { repository, dispatched, service: new SiteManagementService(repository, monitoring, renewals, executor) };
}

test("site plans reject domains already claimed by the target node", async () => {
  const database = openDatabase(":memory:");
  try {
    const monitored = { id: "site_existing_01", nodeId: "node-local", domain: "app.example.com", status: "running", runtime: "static", host: "node-local", upstream: null, source: "Nginx", latencyMs: null, trafficBytes: null, errorRatePercent: null, lastDeployAt: null, manageability: "monitored", managementReason: "Discovered", protected: false, version: 1, desiredState: null, collectedAt: new Date().toISOString(), freshness: "current", certificate: { status: "unavailable", notBefore: null, expiresAt: null, issuer: null, subjectAlternativeNames: [], fingerprintSha256: null, renewalMode: "unsupported", renewable: false, unavailableReason: "Unavailable", certificateId: null }, renewal: { batchId: null, taskId: null, status: "idle", message: null, updatedAt: null } };
    const { service, dispatched } = managementFixture(database, undefined, [monitored]);
    await assert.rejects(() => service.createPlan(planInput, { nodeScope: "all" }, "user:test"), /已由目标节点的 Nginx 配置使用/);
    assert.equal(dispatched.length, 0);
    monitored.manageability = "managed";
    await service.createPlan({ ...planInput, idempotencyKey: "redeploy-site-001" }, { nodeScope: "all" }, "user:test");
    assert.equal(dispatched.length, 1);
  } finally { database.close(); }
});

test("site plans persist idempotently while environment values remain encrypted and absent from public records", async () => {
  const database = openDatabase(":memory:");
  try {
    const { repository, service, dispatched } = managementFixture(database);
    const first = await service.createPlan(planInput, { nodeScope: "all" }, "user:test");
    const repeated = await service.createPlan(planInput, { nodeScope: "all" }, "user:test");
    assert.equal(repeated.planId, first.planId);
    assert.equal(dispatched.length, 1);
    assert.deepEqual(first.environmentVariableNames, ["API_MODE"]);
    assert.equal(Object.hasOwn(first, "certificateEmail"), false);
    assert.doesNotMatch(JSON.stringify(first), /API_MODE.*production|"value":"production"/);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM site_plans").get().count, 1);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM site_environment_references").get().count, 2);
    assert.doesNotMatch(JSON.stringify(database.prepare("SELECT hex(ciphertext) AS value FROM encrypted_secrets").all()), /production/);
    service.complete(first.operationId, true, { ...emptyResult({ runtime: "node22", healthCheckPath: "/healthz", changes: ["repository", "runtime", "nginx", "certificate", "environment", "traffic_switch"] }), stagingId: "staging-site-001" }, null);
    const ready = repository.getPlan(first.planId);
    assert.equal(ready.status, "ready");
    const activation = await service.activate(first.planId, { planVersion: ready.version, planDigest: ready.digest, idempotencyKey: "activate-site-001" }, { nodeScope: "all" }, "user:test");
    assert.equal(activation.status, "queued");
    assert.equal(dispatched[1].instruction.type, "activate");
  } finally { database.close(); }
});

test("activation rejects an agent site ID that does not match the plan node and primary domain", async () => {
  const database = openDatabase(":memory:");
  try {
    const { repository, service } = managementFixture(database);
    const plan = await service.createPlan(planInput, { nodeScope: "all" }, "user:test");
    service.complete(plan.operationId, true, { ...emptyResult(), stagingId: "staging-site-001" }, null);
    const ready = repository.getPlan(plan.planId);
    const activation = await service.activate(plan.planId, { planVersion: ready.version, planDigest: ready.digest, idempotencyKey: "activate-forged-site-001" }, { nodeScope: "all" }, "user:test");
    const forgedSiteId = managedSiteId("node-victim", "victim.example.com");
    const victim = { siteId: forgedSiteId, nodeId: "node-victim", domainDigest: sha256("victim.example.com"), desiredState: "stopped", protected: true, version: 9, activeReleaseId: "release-victim", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    repository.saveManagedSite(victim);

    const completed = service.complete(activation.operationId, true, { ...emptyResult(), siteId: forgedSiteId, releaseId: "release-forged" }, null);

    assert.equal(completed.status, "failed");
    assert.equal(completed.errorCode, "INVALID_REMOTE_TASK_RESULT");
    assert.equal(completed.result, null);
    assert.deepEqual(repository.getManagedSite(forgedSiteId), victim);
    assert.equal(repository.getManagedSite(managedSiteId(planInput.nodeId, planInput.domains[0])), null);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM site_releases").get().count, 0);
    assert.equal(repository.getPlan(plan.planId).status, "ready");
  } finally { database.close(); }
});

test("dispatch failures persist as terminal operations and idempotent retries do not redispatch", async () => {
  const database = openDatabase(":memory:"); let attempts = 0;
  try {
    const executor = { dispatch: async () => { attempts += 1; throw new Error("node unavailable"); }, reconcile: async () => null };
    const { repository, service } = managementFixture(database, executor);
    const failed = await service.createPlan(planInput, { nodeScope: "all" }, "user:test");
    assert.equal(failed.status, "failed");
    const operation = repository.getOperation(failed.operationId);
    assert.equal(operation.status, "failed"); assert.equal(operation.stage, "dispatch_failed"); assert.equal(operation.errorCode, "DISPATCH_FAILED");
    const repeated = await service.createPlan(planInput, { nodeScope: "all" }, "user:test");
    assert.equal(repeated.planId, failed.planId); assert.equal(repeated.status, "failed"); assert.equal(attempts, 1);
  } finally { database.close(); }
});

test("SQLite remote task storage encrypts site deployment parameters", async () => {
  const database = openDatabase(":memory:");
  try {
    const secrets = new SecretStore(database, Buffer.alloc(32, 6));
    const repository = new SqliteAgentControlRepository(database, undefined, secrets);
    const task = {
      protocolVersion: "1.0", taskId: crypto.randomUUID(), type: "sites.plan.prepare", targetNodeId: crypto.randomUUID(),
      parameters: { operationId: crypto.randomUUID(), certificateContact: "operator@example.com", environmentVariables: [{ name: "API_MODE", value: "sensitive-value" }] },
      createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), idempotencyKey: "encrypted-task-001",
      requester: "controller:site-management", traceId: crypto.randomUUID(), requiredCapability: "sites.deploy", attempt: 0, maxAttempts: 1,
      status: "queued", updatedAt: new Date().toISOString(), result: null, errorCode: null, retryable: false, nextAttemptAt: null,
    };
    await repository.update((state) => state.tasks.push(task));
    const row = database.prepare("SELECT payload FROM remote_tasks WHERE task_id=?").get(task.taskId);
    assert.match(row.payload, /encryptedTaskKey/);
    assert.doesNotMatch(row.payload, /operator@example|sensitive-value|environmentVariables/);
    assert.deepEqual((await repository.read()).tasks[0].parameters, task.parameters);
  } finally { database.close(); }
});

test("site management HTTP endpoints enforce permission, CSRF, one-time reauthentication and strict bodies", async () => {
  const database = openDatabase(":memory:");
  const identity = new IdentityService(database, Buffer.alloc(32, 8));
  await identity.createInitialAdministrator("admin", "Administrator", "correct horse battery staple");
  const config = loadControllerConfig({ STACKPILOT_COOKIE_SECURE: "0", STACKPILOT_ALLOWED_ORIGINS: "http://127.0.0.1:5173" });
  const siteRepository = new SqliteSiteManagementRepository(database, new SecretStore(database, Buffer.alloc(32, 8)));
  const services = createControllerServices(new FakePlatformAdapter(), process.cwd(), config, new MemoryAgentControlRepository(), siteRepository);
  services.siteManagement = new SiteManagementService(siteRepository, services.sites, services.certificateRenewals, { dispatch: async () => crypto.randomUUID(), reconcile: async () => null });
  const server = createStackPilotServer({ config, services, database, identity });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { Origin: "http://127.0.0.1:5173", "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: "correct horse battery staple" }) });
    const session = await login.json();
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const headers = { Origin: "http://127.0.0.1:5173", Cookie: cookie, "X-CSRF-Token": session.csrfToken, "Content-Type": "application/json" };
    assert.equal((await fetch(`${base}/api/site-plans`, { method: "POST", headers, body: JSON.stringify(planInput) })).status, 403);
    const reauth = await (await fetch(`${base}/api/auth/reauthenticate`, { method: "POST", headers, body: JSON.stringify({ password: "correct horse battery staple" }) })).json();
    const created = await fetch(`${base}/api/site-plans`, { method: "POST", headers: { ...headers, "X-Reauth-Proof": reauth.proof }, body: JSON.stringify(planInput) });
    assert.equal(created.status, 202);
    const plan = await created.json();
    assert.equal(plan.status, "queued");
    assert.deepEqual(plan.environmentVariableNames, ["API_MODE"]);
    assert.equal(Object.hasOwn(plan, "certificateEmail"), false);
    assert.equal((await fetch(`${base}/api/site-plans`, { method: "POST", headers: { ...headers, "X-Reauth-Proof": reauth.proof }, body: JSON.stringify(planInput) })).status, 403);
    const operation = await fetch(`${base}/api/site-operations/${plan.operationId}`, { headers: { Cookie: cookie } });
    assert.equal(operation.status, 200);
    assert.equal((await operation.json()).operationId, plan.operationId);
    const readOnly = identity.createApiToken((await identity.login("admin", "correct horse battery staple", "test", "ua")).principal, { name: "sites-reader", permissions: ["sites:read"], nodeScope: "all", expiresAt: null }).token;
    assert.equal((await fetch(`${base}/api/site-plans`, { method: "POST", headers: { Authorization: `Bearer ${readOnly}`, "Content-Type": "application/json" }, body: JSON.stringify(planInput) })).status, 403);
  } finally { server.close(); await once(server, "close"); database.close(); }
});
