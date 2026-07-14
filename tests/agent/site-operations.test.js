import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { siteLifecycleHandler, sitePlanPrepareHandler } from "../../apps/agent/dist/tasks/handlers/siteOperations.js";

test("site prepare handler sends only the fixed helper request over Unix socket", { skip: process.platform === "win32" ? "Unix socket site helper is Linux-only" : false }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "stackpilot-agent-helper-")); const socketPath = join(directory, "helper.sock"); let received;
  const server = createServer((socket) => {
    let raw = ""; socket.on("data", (chunk) => { raw += chunk; }); socket.on("end", () => {
      received = JSON.parse(raw.trim()); socket.end(`${JSON.stringify({ ok: true, operation: "prepare", data: { operationId: received.requestId, stagingId: `staging_${"a".repeat(32)}`, planPreview: { runtime: "static", healthCheckPath: null, changes: ["repository"] } } })}\n`);
    });
  });
  await new Promise((resolve) => server.listen(socketPath, resolve));
  try {
    const input = { operationId: "11111111-1111-4111-8111-111111111111", planId: "22222222-2222-4222-8222-222222222222", domains: ["app.example.com"], repositoryUrl: "https://github.com/example/site.git", repositoryRef: "main", certificateContact: "ops@example.com", certificateEnvironment: "staging", environmentVariables: [{ name: "PUBLIC_NAME", value: "example" }], expectedPlanDigest: "b".repeat(64), runtimeInstallAuthorized: true };
    const result = await sitePlanPrepareHandler(input, new AbortController().signal, "33333333-3333-4333-8333-333333333333", false, socketPath);
    assert.equal(result.data.operationId, input.operationId); assert.equal(received.operation, "prepare"); assert.equal(received.nodeId, "33333333-3333-4333-8333-333333333333");
    assert.deepEqual(Object.keys(received).sort(), ["certificateEmail", "certificateEnvironment", "domains", "environmentVariables", "expectedPlanDigest", "nodeId", "operation", "planId", "repositoryRef", "repositoryUrl", "requestId", "runtimeInstallAuthorized"]);
    assert.equal(received.runtimeInstallAuthorized, false);
    assert.equal(JSON.stringify(received).includes("taskId"), false); assert.equal(JSON.stringify(received).includes("requiredCapability"), false);
  } finally { await new Promise((resolve) => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
});

test("site lifecycle forwards the optimistic version to the root helper", { skip: process.platform === "win32" ? "Unix socket site helper is Linux-only" : false }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "stackpilot-agent-helper-")); const socketPath = join(directory, "helper.sock"); let received;
  const server = createServer((socket) => {
    let raw = ""; socket.on("data", (chunk) => { raw += chunk; }); socket.on("end", () => {
      received = JSON.parse(raw.trim()); socket.end(`${JSON.stringify({ ok: true, operation: "lifecycle", data: { operationId: received.requestId, siteId: received.siteId, desiredState: "stopped" } })}\n`);
    });
  });
  await new Promise((resolve) => server.listen(socketPath, resolve));
  try {
    const input = { operationId: "11111111-1111-4111-8111-111111111111", siteId: `site-${"a".repeat(32)}`, action: "stopped", expectedVersion: 7 };
    await siteLifecycleHandler(input, new AbortController().signal, undefined, socketPath);
    assert.equal(received.expectedVersion, 7);
    assert.deepEqual(Object.keys(received).sort(), ["action", "expectedVersion", "operation", "requestId", "siteId"]);
  } finally { await new Promise((resolve) => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
});
