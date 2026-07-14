import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { SiteManagementService } from "../../apps/controller/dist/modules/sites/siteManagementService.js";
import { MemorySiteManagementRepository } from "../../apps/controller/dist/modules/sites/siteManagementRepository.js";

const requester = "user:scope-regression";
const nodeId = "node-idempotency-scope";
const siteId = "site-idempotency-scope";
const now = new Date().toISOString();
const digest = (type, key) => createHash("sha256").update(`${requester}\0${type}\0${key}`).digest("hex");

const cases = [
  {
    name: "activate",
    operationType: "activate",
    keyType: "activate:11111111-1111-4111-8111-111111111111",
    invoke: (service, key, access) => service.activate("11111111-1111-4111-8111-111111111111", { idempotencyKey: key }, access, requester),
  },
  {
    name: "lifecycle",
    operationType: "lifecycle",
    keyType: `lifecycle:${siteId}`,
    invoke: (service, key, access) => service.updateLifecycle(siteId, { idempotencyKey: key }, access, requester),
  },
  {
    name: "renew",
    operationType: "certificate_renewal",
    keyType: `renew:${siteId}`,
    invoke: (service, key, access) => service.renewCertificate(siteId, { idempotencyKey: key }, access, requester, randomUUID()),
  },
  {
    name: "logs",
    operationType: "log_query",
    keyType: `logs:${siteId}`,
    invoke: (service, key, access) => service.queryLogs(siteId, { idempotencyKey: key }, access, requester),
  },
];

test("site operation idempotency hits enforce the requester's current node scope", async () => {
  let dispatches = 0;
  let collections = 0;
  let renewals = 0;
  const repository = new MemorySiteManagementRepository();
  const service = new SiteManagementService(
    repository,
    { getSites: async () => { collections += 1; throw new Error("idempotency hit must not collect sites"); } },
    { create: async () => { renewals += 1; throw new Error("idempotency hit must not renew"); }, get: async () => { throw new Error("unused"); } },
    { dispatch: async () => { dispatches += 1; throw new Error("idempotency hit must not dispatch"); }, reconcile: async () => null },
  );

  for (const scenario of cases) {
    const key = `scope-${scenario.name}`;
    const saved = {
      operationId: randomUUID(), taskId: randomUUID(), type: scenario.operationType,
      nodeId, siteId: scenario.name === "activate" ? null : siteId,
      planId: scenario.name === "activate" ? "11111111-1111-4111-8111-111111111111" : null,
      status: "succeeded", stage: "complete", progressPercent: 100,
      result: scenario.name === "logs" ? {
        message: null, siteId, releaseId: null, stagingId: null, desiredState: null,
        certificateRenewalBatchId: null, planPreview: null,
        logs: [{ timestamp: now, method: "GET", path: "/private", status: 200, bytesSent: 128, clientAddressMasked: "192.0.2.xxx" }],
      } : null,
      errorCode: null, createdAt: now, updatedAt: now,
    };
    repository.saveOperation(saved, digest(scenario.keyType, key));

    await assert.rejects(
      () => scenario.invoke(service, key, { nodeScope: [] }),
      (error) => error.status === 403 && error.code === "FORBIDDEN",
      `${scenario.name} must reject a replay after node scope is revoked`,
    );
    const repeated = await scenario.invoke(service, key, { nodeScope: [nodeId] });
    assert.equal(repeated.operationId, saved.operationId, `${scenario.name} must preserve valid idempotency`);
    if (scenario.name === "logs") assert.equal(repeated.result.logs[0].path, "/private");
  }

  assert.equal(dispatches, 0);
  assert.equal(collections, 0);
  assert.equal(renewals, 0);
});
