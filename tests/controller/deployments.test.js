import assert from "node:assert/strict";
import test from "node:test";
import { MemorySiteManagementRepository } from "../../apps/controller/dist/modules/sites/siteManagementRepository.js";
import { DeploymentQueryService } from "../../apps/controller/dist/modules/deployments/deploymentQueryService.js";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { IdentityService } from "../../apps/controller/dist/identity/identityService.js";
import { createControllerServices } from "../../apps/controller/dist/app.js";
import { createStackPilotServer } from "../../apps/controller/dist/server.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";
import { MemoryAgentControlRepository } from "../../apps/controller/dist/repositories/agentControlRepository.js";
import { loadControllerConfig } from "../../apps/controller/dist/config/environment.js";
import { once } from "node:events";

const now = "2026-07-15T00:00:00.000Z";
const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

test("deployment query maps real site plans and operations without fixtures", () => {
  const repository = new MemorySiteManagementRepository();
  const planId = "22222222-2222-4222-8222-222222222222";
  const operationId = "11111111-1111-4111-8111-111111111111";
  const plan = { planId, nodeId: "node-production-01", deploymentEnvironment: "staging", domains: ["stackpilot.example.com"], repositoryUrl: "https://github.com/example/stackpilot.git", repositoryRef: "main", certificateEnvironment: "production", environmentVariableNames: [], operator: "管理员", status: "ready", digest: "a".repeat(64), version: 1, preview: { runtime: "node22", healthCheckPath: "/healthz", changes: ["repository"] }, operationId, createdAt: now, updatedAt: now, expiresAt: future };
  const operation = { operationId, taskId: null, type: "prepare", nodeId: plan.nodeId, siteId: null, planId, status: "succeeded", stage: "complete", progressPercent: 100, result: { message: null, siteId: null, releaseId: null, stagingId: "staging-example-01", desiredState: null, certificateRenewalBatchId: null, planPreview: plan.preview, logs: [] }, errorCode: null, createdAt: now, updatedAt: now };
  repository.savePlanWithOperation(plan, "plan-digest", "ops@example.com", [], operation, "operation-digest");
  const payload = new DeploymentQueryService(repository).list({ nodeScope: "all" });
  assert.equal(payload.deployments.length, 1);
  assert.equal(payload.deployments[0].status, "ready");
  assert.equal(payload.deployments[0].environment, "staging");
  assert.equal(payload.deployments[0].operator, "管理员");
});

test("deployment query ignores mismatched and non-deployment operations", () => {
  const repository = new MemorySiteManagementRepository();
  const planId = "22222222-2222-4222-8222-222222222222";
  const operationId = "11111111-1111-4111-8111-111111111111";
  const plan = { planId, nodeId: "node-production-01", deploymentEnvironment: "production", domains: ["stackpilot.example.com"], repositoryUrl: "https://github.com/example/stackpilot.git", repositoryRef: "feature/not-an-environment", certificateEnvironment: "production", environmentVariableNames: [], operator: null, status: "ready", digest: "a".repeat(64), version: 1, preview: null, operationId, createdAt: now, updatedAt: now, expiresAt: future };
  const valid = { operationId, taskId: null, type: "prepare", nodeId: plan.nodeId, siteId: null, planId, status: "succeeded", stage: "complete", progressPercent: 100, result: null, errorCode: null, createdAt: now, updatedAt: now };
  repository.savePlanWithOperation(plan, "plan-key", "ops@example.com", [], valid, "valid-operation-key");
  repository.saveOperation({ ...valid, operationId: "33333333-3333-4333-8333-333333333333", nodeId: "node-other-01", updatedAt: "2026-07-15T00:01:00.000Z" }, "mismatched-node-key");
  repository.saveOperation({ ...valid, operationId: "44444444-4444-4444-8444-444444444444", type: "lifecycle", updatedAt: "2026-07-15T00:02:00.000Z" }, "lifecycle-key");
  const payload = new DeploymentQueryService(repository).list({ nodeScope: "all" });
  assert.equal(payload.deployments.length, 1);
  assert.equal(payload.deployments[0].operationId, operationId);
  assert.equal(payload.deployments[0].environment, "production");
});

test("deployment query enforces an empty node scope", () => {
  const repository = new MemorySiteManagementRepository();
  const service = new DeploymentQueryService(repository);
  assert.deepEqual(service.list({ nodeScope: [] }).deployments, []);
  assert.deepEqual(service.list({ nodeScope: [] }).releases, []);
});

test("deployment HTTP endpoint enforces authentication and sites read permission", async () => {
  const database = openDatabase(":memory:"); const identity = new IdentityService(database, Buffer.alloc(32, 8));
  await identity.createInitialAdministrator("admin", "Administrator", "correct horse battery staple");
  const admin = (await identity.login("admin", "correct horse battery staple", "test", "ua")).principal;
  const readToken = identity.createApiToken(admin, { name: "sites", permissions: ["sites:read"], nodeScope: "all", expiresAt: null }).token;
  const noReadToken = identity.createApiToken(admin, { name: "overview", permissions: ["overview:read"], nodeScope: "all", expiresAt: null }).token;
  const config = loadControllerConfig({ STACKPILOT_COOKIE_SECURE: "0" });
  const services = createControllerServices(new FakePlatformAdapter(), process.cwd(), config, new MemoryAgentControlRepository());
  const server = createStackPilotServer({ config, services, database, identity }); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/deployments`)).status, 401);
    assert.equal((await fetch(`${base}/api/deployments`, { headers: { Authorization: `Bearer ${noReadToken}` } })).status, 403);
    const response = await fetch(`${base}/api/deployments`, { headers: { Authorization: `Bearer ${readToken}` } });
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual((await response.json()).deployments, []);
  } finally { server.close(); await once(server, "close"); database.close(); }
});
