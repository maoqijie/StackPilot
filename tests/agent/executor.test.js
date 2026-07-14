import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AGENT_PROTOCOL_VERSION } from "@stackpilot/contracts";
import { TaskExecutor } from "../../apps/agent/dist/tasks/executor.js";
import { taskRegistry } from "../../apps/agent/dist/tasks/registry.js";
import { activeAgentCapabilities } from "../../apps/agent/dist/capabilities/index.js";

const nodeId = "11111111-1111-4111-8111-111111111111";
const task = (overrides = {}) => ({ protocolVersion: AGENT_PROTOCOL_VERSION, taskId: "22222222-2222-4222-8222-222222222222", type: "system.summary.read", targetNodeId: nodeId, parameters: { includeLoad: false }, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), idempotencyKey: "summary-once-123", requester: "test", traceId: "33333333-3333-4333-8333-333333333333", requiredCapability: "system.summary.read", attempt: 1, maxAttempts: 3, ...overrides });

test("task registry exposes only structured handlers and keeps renewal non-retryable", () => {
  assert.deepEqual(Object.keys(taskRegistry).sort(), ["service.status.read", "sites.certificates.renew", "sites.lifecycle.update", "sites.logs.read", "sites.plan.activate", "sites.plan.prepare", "system.summary.read"]);
  assert.ok(Object.values(taskRegistry).every((definition) => definition.maxOutputBytes <= 16_384));
  assert.ok(Object.keys(taskRegistry).every((name) => !/shell|exec|command/i.test(name)));
  assert.equal(taskRegistry["sites.certificates.renew"].retryable, false); assert.deepEqual(taskRegistry["sites.certificates.renew"].platforms, ["linux"]); assert.equal(taskRegistry["sites.certificates.renew"].timeoutMs, 600_000);
  assert.equal(taskRegistry["sites.plan.prepare"].capability, "sites.deploy"); assert.equal(taskRegistry["sites.plan.prepare"].retryable, false);
  assert.equal(taskRegistry["sites.lifecycle.update"].capability, "sites.lifecycle.manage"); assert.equal(taskRegistry["sites.lifecycle.update"].retryable, false);
  assert.equal(taskRegistry["sites.logs.read"].capability, "sites.logs.read"); assert.equal(taskRegistry["sites.logs.read"].retryable, false);
});

test("high-risk renewal capability is declared only on Linux with a reachable helper", () => {
  assert.deepEqual(activeAgentCapabilities("linux", false), ["system.summary.read", "service.status.read", "sites.inventory.read"]);
  assert.deepEqual(activeAgentCapabilities("darwin", true), ["system.summary.read", "service.status.read", "sites.inventory.read"]);
  assert.deepEqual(activeAgentCapabilities("linux", true), ["system.summary.read", "service.status.read", "sites.inventory.read", "sites.logs.read", "sites.deploy", "sites.lifecycle.manage", "sites.certificates.renew", "runtime.install"]);
  assert.deepEqual(activeAgentCapabilities("linux", false, true), ["system.summary.read", "service.status.read", "sites.inventory.read", "databases.inventory.read"]);
  assert.deepEqual(activeAgentCapabilities("linux", true, true), ["system.summary.read", "service.status.read", "sites.inventory.read", "databases.inventory.read", "sites.logs.read", "sites.deploy", "sites.lifecycle.manage", "sites.certificates.renew", "runtime.install"]);
});

test("executor validates target, expiry, capability and unknown types", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stackpilot-agent-test-"));
  try {
    const executor = new TaskExecutor(join(directory, "receipts.json"), nodeId, "linux", ["system.summary.read"]); await executor.load();
    await assert.rejects(() => executor.execute(task({ targetNodeId: "44444444-4444-4444-8444-444444444444" })), /WRONG_TARGET/);
    await assert.rejects(() => executor.execute(task({ expiresAt: new Date(Date.now() - 1).toISOString() })), /TASK_EXPIRED/);
    await assert.rejects(() => executor.execute(task({ requiredCapability: "service.status.read" })), /CAPABILITY_DENIED/);
    await assert.rejects(() => executor.execute(task({ type: "run-shell" })), (error) => error.name === "ZodError");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("site prepare passes the Agent's current runtime capability to its handler", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stackpilot-agent-test-")); const observed = [];
  const registry = { ...taskRegistry, "sites.plan.prepare": { ...taskRegistry["sites.plan.prepare"], run: async (parameters, _signal, _nodeId, capabilities) => {
    observed.push({ parameters, capabilities }); return { message: "prepared", truncated: false };
  } } };
  const parameters = { operationId: "77777777-7777-4777-8777-777777777777", planId: "88888888-8888-4888-8888-888888888888", domains: ["app.example.com"], repositoryUrl: "https://github.com/example/site.git", repositoryRef: "main", certificateContact: "ops@example.com", certificateEnvironment: "staging", environmentVariables: [], expectedPlanDigest: "a".repeat(64), runtimeInstallAuthorized: true };
  const prepare = task({ taskId: "99999999-9999-4999-8999-999999999999", type: "sites.plan.prepare", parameters, requiredCapability: "sites.deploy", idempotencyKey: "prepare-runtime-denied" });
  try {
    const denied = new TaskExecutor(join(directory, "denied.json"), nodeId, "linux", ["sites.deploy"], registry); await denied.load(); await denied.execute(prepare);
    assert.equal(observed[0].parameters.runtimeInstallAuthorized, true); assert.deepEqual(observed[0].capabilities, ["sites.deploy"]);
    const allowed = new TaskExecutor(join(directory, "allowed.json"), nodeId, "linux", ["sites.deploy", "runtime.install"], registry); await allowed.load();
    await allowed.execute({ ...prepare, taskId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", idempotencyKey: "prepare-runtime-allowed" });
    assert.deepEqual(observed[1].capabilities, ["sites.deploy", "runtime.install"]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("executor persists receipts before execution and prevents duplicate delivery", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stackpilot-agent-test-")); const receiptPath = join(directory, "receipts.json");
  try {
    const executor = new TaskExecutor(receiptPath, nodeId, "linux", ["system.summary.read"]); await executor.load();
    const first = await executor.execute(task()); assert.equal(first.status, "succeeded");
    const second = await executor.execute(task()); assert.deepEqual(second, first);
    const duplicateKey = await executor.execute(task({ taskId: "66666666-6666-4666-8666-666666666666" })); assert.equal(duplicateKey.status, "failed"); assert.equal(duplicateKey.errorCode, "DUPLICATE_IDEMPOTENCY_KEY");
    const receipts = JSON.parse(await readFile(receiptPath, "utf8")); assert.equal(receipts.length, 1); assert.equal(receipts[0].reported, false);
    await executor.markReported(first.taskId); assert.equal(executor.pendingUpdates().length, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("restart converts an uncertain running receipt to a reportable failure without re-execution", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stackpilot-agent-test-")); const receiptPath = join(directory, "receipts.json");
  try {
    await import("node:fs/promises").then(({ writeFile }) => writeFile(receiptPath, JSON.stringify([{ taskId: task().taskId, idempotencyKey: task().idempotencyKey, attempt: 1, status: "running", updatedAt: new Date().toISOString(), reported: true, update: { taskId: task().taskId, attempt: 1, status: "running", timestamp: new Date().toISOString() } }])));
    const executor = new TaskExecutor(receiptPath, nodeId, "linux", ["system.summary.read"]); await executor.load();
    assert.equal(executor.pendingUpdates()[0].errorCode, "AGENT_RESTARTED_DURING_TASK");
    assert.equal((await executor.execute(task())).status, "failed");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("executor enforces timeout and cooperative cancellation with an injected handler", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stackpilot-agent-test-"));
  const slowRegistry = {
    ...taskRegistry,
    "system.summary.read": {
      ...taskRegistry["system.summary.read"], timeoutMs: 20,
      run: (_parameters, signal) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve({ message: "unexpected", truncated: false }), 5_000);
        signal.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("aborted")); }, { once: true });
      }),
    },
  };
  try {
    const timeoutExecutor = new TaskExecutor(join(directory, "timeout.json"), nodeId, "linux", ["system.summary.read"], slowRegistry); await timeoutExecutor.load();
    assert.equal((await timeoutExecutor.execute(task())).status, "cancelled");
    const cancelTask = task({ taskId: "55555555-5555-4555-8555-555555555555", idempotencyKey: "cancel-summary-123" });
    const cancelExecutor = new TaskExecutor(join(directory, "cancel.json"), nodeId, "linux", ["system.summary.read"], slowRegistry); await cancelExecutor.load();
    const execution = cancelExecutor.execute(cancelTask); setTimeout(() => cancelExecutor.cancel(cancelTask.taskId), 5);
    assert.equal((await execution).status, "cancelled");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("executor reports cancellation when a handler returns after its abort signal", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stackpilot-agent-test-"));
  const lateRegistry = {
    ...taskRegistry,
    "system.summary.read": {
      ...taskRegistry["system.summary.read"], timeoutMs: 5,
      run: () => new Promise((resolve) => setTimeout(() => resolve({ message: "late result", truncated: false }), 15)),
    },
  };
  try {
    const executor = new TaskExecutor(join(directory, "late.json"), nodeId, "linux", ["system.summary.read"], lateRegistry); await executor.load();
    const result = await executor.execute(task());
    assert.equal(result.status, "cancelled");
    assert.equal(result.errorCode, "TASK_CANCELLED_OR_TIMEOUT");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
