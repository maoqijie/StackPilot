import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AGENT_PROTOCOL_VERSION } from "@stackpilot/contracts";
import { TaskExecutor } from "../../apps/agent/dist/tasks/executor.js";
import { taskRegistry } from "../../apps/agent/dist/tasks/registry.js";
import { activeAgentCapabilities } from "../../apps/agent/dist/capabilities/index.js";
import { terminalCommandHandler, terminalCommandInvocation, terminalCommandsAvailable, truncateTerminalOutput } from "../../apps/agent/dist/tasks/handlers/terminalCommand.js";

const nodeId = "11111111-1111-4111-8111-111111111111";
const task = (overrides = {}) => ({ protocolVersion: AGENT_PROTOCOL_VERSION, taskId: "22222222-2222-4222-8222-222222222222", type: "system.summary.read", targetNodeId: nodeId, parameters: { includeLoad: false }, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), idempotencyKey: "summary-once-123", requester: "test", traceId: "33333333-3333-4333-8333-333333333333", requiredCapability: "system.summary.read", attempt: 1, maxAttempts: 3, ...overrides });

test("task registry exposes only structured handlers and keeps side effects non-retryable", () => {
  assert.deepEqual(Object.keys(taskRegistry).sort(), ["service.status.read", "sites.certificates.renew", "system.summary.read", "terminal.command.execute"]);
  assert.ok(Object.values(taskRegistry).every((definition) => definition.maxOutputBytes <= 16_384));
  assert.ok(Object.keys(taskRegistry).every((name) => !/shell/i.test(name)));
  assert.equal(taskRegistry["system.summary.read"].timeoutMs, 6_000);
  assert.equal(taskRegistry["terminal.command.execute"].timeoutMs, 10_000); assert.equal(taskRegistry["terminal.command.execute"].maxOutputBytes, 1_024); assert.equal(taskRegistry["terminal.command.execute"].retryable, false); assert.equal(taskRegistry["terminal.command.execute"].cancellable, true); assert.deepEqual(taskRegistry["terminal.command.execute"].platforms, ["linux"]);
  assert.equal(taskRegistry["sites.certificates.renew"].retryable, false); assert.equal(taskRegistry["sites.certificates.renew"].cancellable, false); assert.deepEqual(taskRegistry["sites.certificates.renew"].platforms, ["linux"]); assert.equal(taskRegistry["sites.certificates.renew"].timeoutMs, 600_000);
});

test("Linux Agent declares terminal execution only when every fixed executable is available", () => {
  assert.deepEqual(activeAgentCapabilities("linux", false), ["system.summary.read", "service.status.read", "sites.inventory.read"]);
  assert.deepEqual(activeAgentCapabilities("linux", false, false, true), ["system.summary.read", "service.status.read", "sites.inventory.read", "terminal.command.execute"]);
  assert.deepEqual(activeAgentCapabilities("darwin", true), ["system.summary.read", "service.status.read", "sites.inventory.read"]);
  assert.deepEqual(activeAgentCapabilities("linux", true, false, true), ["system.summary.read", "service.status.read", "sites.inventory.read", "terminal.command.execute", "sites.certificates.renew"]);
  assert.deepEqual(activeAgentCapabilities("linux", true, true, true, true), [
    "system.summary.read", "service.status.read", "sites.inventory.read", "databases.inventory.read", "terminal.command.execute", "sites.certificates.renew",
    "database.inventory.read", "database.sql.read", "database.backup", "database.operate", "database.install", "database.restore",
  ]);
  assert.equal(terminalCommandsAvailable(() => true), true); assert.equal(terminalCommandsAvailable((path) => path !== "/usr/bin/top"), false);
});

test("terminal handler maps strict commands to fixed executables and preserves non-zero output", async () => {
  assert.deepEqual(terminalCommandInvocation({ command: "disk-usage" }), { executable: "/usr/bin/df", args: ["-h"] });
  assert.deepEqual(terminalCommandInvocation({ command: "uptime" }), { executable: "/usr/bin/uptime", args: [] });
  assert.deepEqual(terminalCommandInvocation({ command: "top-summary" }), { executable: "/usr/bin/top", args: ["-b", "-n", "1"] });
  assert.deepEqual(terminalCommandInvocation({ command: "service-status", serviceName: "nginx.service" }), { executable: "/usr/bin/systemctl", args: ["status", "nginx.service", "--no-pager"] });
  const calls = [];
  const result = await terminalCommandHandler({ command: "service-status", serviceName: "nginx.service" }, new AbortController().signal, async (executable, args, options) => {
    calls.push({ executable, args, options }); const error = new Error("inactive"); error.code = 3; error.stdout = "nginx.service inactive\n"; error.stderr = "diagnostic\n"; throw error;
  });
  assert.equal(calls[0].executable, "/usr/bin/systemctl"); assert.deepEqual(calls[0].args, ["status", "nginx.service", "--no-pager"]); assert.equal(calls[0].options.maxBuffer, 64 * 1_024);
  assert.equal(result.message, "nginx.service inactive\ndiagnostic"); assert.equal(result.data.exitCode, 3); assert.equal(result.truncated, false);
});

test("terminal output truncation is UTF-8 safe and reports truncation", () => {
  const result = truncateTerminalOutput("你".repeat(400), 1_024);
  assert.equal(Buffer.byteLength(result.output, "utf8") <= 1_024, true); assert.equal(result.output.endsWith("�"), false); assert.equal(result.truncated, true);
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

test("non-cancellable renewal timeout is reported as an unknown result", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stackpilot-agent-test-"));
  const renewalRegistry = {
    ...taskRegistry,
    "sites.certificates.renew": {
      ...taskRegistry["sites.certificates.renew"], timeoutMs: 5,
      run: (_parameters, signal) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve({ message: "late", truncated: false }), 5_000);
        signal.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("aborted")); }, { once: true });
      }),
    },
  };
  const renewal = task({ type: "sites.certificates.renew", requiredCapability: "sites.certificates.renew", maxAttempts: 1, idempotencyKey: "renew-timeout-123", parameters: { batchId: "44444444-4444-4444-8444-444444444444", certificates: [{ certificateId: "cert_test_1", siteIds: ["site-test-1"] }] } });
  try {
    const executor = new TaskExecutor(join(directory, "renewal.json"), nodeId, "linux", ["sites.certificates.renew"], renewalRegistry); await executor.load();
    const execution = executor.execute(renewal); setTimeout(() => executor.cancel(renewal.taskId), 1);
    const result = await execution;
    assert.equal(result.status, "failed");
    assert.equal(result.errorCode, "RESULT_UNKNOWN");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
