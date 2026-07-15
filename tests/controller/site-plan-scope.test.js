import assert from "node:assert/strict";
import test from "node:test";
import { MemorySiteManagementRepository } from "../../apps/controller/dist/modules/sites/siteManagementRepository.js";
import { SiteManagementService } from "../../apps/controller/dist/modules/sites/siteManagementService.js";

const input = {
  nodeId: "node-original",
  domains: ["scope.example.com"],
  repositoryUrl: "https://github.com/example/project.git",
  repositoryRef: "main",
  certificateEmail: "operator@example.com",
  environmentVariables: [],
  idempotencyKey: "plan-scope-regression",
};

test("site plan idempotency hits enforce the requester's current node scope", async () => {
  let dispatches = 0;
  const service = new SiteManagementService(
    new MemorySiteManagementRepository(),
    { getSites: async () => ({ collectedAt: new Date().toISOString(), collectionStatus: "complete", warnings: [], sites: [] }) },
    { create: async () => { throw new Error("unused"); }, get: async () => { throw new Error("unused"); } },
    { dispatch: async () => { dispatches += 1; return crypto.randomUUID(); }, reconcile: async () => null },
  );
  const requester = "user:plan-scope-regression";
  const created = await service.createPlan(input, { nodeScope: "all" }, requester);

  await assert.rejects(
    () => service.createPlan({ ...input, nodeId: "node-currently-authorized" }, { nodeScope: ["node-currently-authorized"] }, requester),
    (error) => error.status === 403 && error.code === "FORBIDDEN",
  );
  const repeated = await service.createPlan(input, { nodeScope: [input.nodeId] }, requester);
  assert.equal(repeated.planId, created.planId);
  assert.equal(dispatches, 1);
});
