import assert from "node:assert/strict";
import test from "node:test";
import { OverviewService } from "../../apps/controller/dist/modules/overview/overviewService.js";
import { deriveNodeHealth, summarizeDiskVolumes } from "../../apps/controller/dist/platform/nativeAdapter.js";
import { RESOURCE_THRESHOLDS } from "../../apps/controller/dist/platform/resourceHealth.js";
import { RiskService } from "../../apps/controller/dist/modules/risks/riskService.js";
import { ScheduleService } from "../../apps/controller/dist/modules/schedules/scheduleService.js";
import { TaskService } from "../../apps/controller/dist/modules/tasks/taskService.js";
import { MemoryAgentControlRepository } from "../../apps/controller/dist/repositories/agentControlRepository.js";
import { MemoryTaskStateRepository } from "../../apps/controller/dist/repositories/taskStateRepository.js";
import { CrontabScheduleRepository } from "../../apps/controller/dist/repositories/scheduleRepository.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";

class MemoryExportRepository {
  writes = [];
  async writeJson(area, payload) { this.writes.push({ area, payload }); return `${area}.json`; }
}

class MemoryScheduleRepository {
  jobs = [];
  async read() { return { externalLines: [], jobs: this.jobs }; }
  async write(_externalLines, jobs) { this.jobs = jobs; }
  find(jobs, id) {
    const job = jobs.find((item) => item.id === id);
    if (!job) throw new Error("not found");
    return job;
  }
}

const gib = 1024 ** 3;
const nodeIds = {
  allowed: "11111111-1111-4111-8111-111111111111",
  hidden: "22222222-2222-4222-8222-222222222222",
  revoked: "33333333-3333-4333-8333-333333333333",
};
const localPhysicalHostId = "ph_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function telemetry(hostname, cpu, totalMemoryGb, availableMemoryGb, diskUsedGb, diskTotalGb, collectedAt = new Date().toISOString()) {
  return {
    collectedAt, hostname, primaryIp: "10.0.0.2", cpu: { usagePercent: cpu, coreUsagePercents: [cpu, cpu] },
    memory: { totalBytes: totalMemoryGb * gib, availableBytes: availableMemoryGb * gib }, loadAverage: [1, 2, 3],
    disks: [{ label: "/dev/test", mount: "/", totalBytes: diskTotalGb * gib, usedBytes: diskUsedGb * gib }], uptimeSeconds: 3600,
  };
}

function agentNode(nodeId, name, snapshot, overrides = {}) {
  const now = new Date().toISOString();
  return {
    nodeId, nodeName: name, status: "online", agentVersion: "0.2.0", protocolVersion: "1.0", platform: "linux",
    declaredCapabilities: ["system.summary.read"], allowedCapabilities: ["system.summary.read"], enrolledAt: now,
    lastSeenAt: now, revokedAt: null, ...(snapshot ? { telemetry: snapshot } : {}), ...overrides,
  };
}

function remoteTask(taskId, targetNodeId, marker) {
  const now = new Date().toISOString();
  return {
    protocolVersion: "1.0", taskId, type: "system.summary.read", targetNodeId, parameters: {}, createdAt: now,
    expiresAt: new Date(Date.now() + 60_000).toISOString(), idempotencyKey: `overview-${marker}`, requester: marker,
    traceId: taskId, requiredCapability: "system.summary.read", attempt: 1, maxAttempts: 3, status: "succeeded",
    updatedAt: now, result: { message: marker, truncated: false }, errorCode: null, retryable: false, nextAttemptAt: null,
  };
}

function auditEvent(eventId, nodeId, marker) {
  return {
    eventId, timestamp: new Date().toISOString(), requester: marker, nodeId, taskId: null, event: marker,
    taskType: null, parameters: null, fromStatus: null, toStatus: "online", resultSummary: null, traceId: eventId,
  };
}

test("overview, task and risk services run against a fake platform", async () => {
  const platform = new FakePlatformAdapter();
  const state = new MemoryTaskStateRepository();
  const exports = new MemoryExportRepository();
  const overview = new OverviewService(platform, state);
  const tasks = new TaskService(overview, state, exports);
  const risks = new RiskService(overview, exports);

  const summary = await overview.getOverview();
  assert.equal(summary.nodes[0].id, "node-local");
  assert.equal(summary.tasks[0].id, "task-test");
  const diskMetric = summary.metrics.find((metric) => metric.label === "磁盘使用率");
  assert.equal(diskMetric.value, "80");
  assert.equal(diskMetric.delta, "2 个盘 · 100.0 GB 可用");
  assert.deepEqual(diskMetric.details?.map((detail) => [detail.label, detail.value]), [["C: (C:\\)", "60%"], ["D: (D:\\)", "93%"]]);
  assert.equal((await tasks.list()).tasks[0].id, "task-test");
  assert.equal(platform.calls.collectSnapshot, 1);
  assert.ok(Array.isArray((await risks.scan()).risks));
  assert.equal(platform.calls.collectSnapshot, 2);
  await tasks.export();
  assert.equal(platform.calls.collectSnapshot, 3);
  await risks.export();
  assert.equal(platform.calls.collectSnapshot, 4);
  assert.deepEqual(exports.writes.map((write) => write.area), ["overview-tasks", "overview-risks"]);
  assert.equal(platform.calls.writeCrontab, 0);
  assert.equal(platform.calls.runScheduledCommand, 0);
});

test("disk usage summary is weighted by capacity across volumes", () => {
  const summary = summarizeDiskVolumes([
    { label: "C:", mount: "C:\\", totalBytes: 200 * gib, freeBytes: 80 * gib, usedBytes: 120 * gib, percent: 60 },
    { label: "D:", mount: "D:\\", totalBytes: 300 * gib, freeBytes: 20 * gib, usedBytes: 280 * gib, percent: 93 },
  ]);
  assert.equal(summary.totalBytes, 500 * gib);
  assert.equal(summary.usedBytes, 400 * gib);
  assert.equal(summary.freeBytes, 100 * gib);
  assert.equal(summary.percent, 80);
});

test("controller node health warns when a core metric is unavailable", () => {
  assert.deepEqual(RESOURCE_THRESHOLDS, { cpu: { warning: 70, critical: 85 }, memory: { warning: 76, critical: 88 }, disk: { warning: 80, critical: 90 } });
  const healthy = { cpuAvailable: true, memoryAvailable: true, diskAvailable: true, cpuPercent: 20, memoryPercent: 30, diskPercent: 40, servicesHealthy: true };
  assert.equal(deriveNodeHealth(healthy), "健康");
  assert.equal(deriveNodeHealth({ ...healthy, cpuPercent: RESOURCE_THRESHOLDS.cpu.warning }), "警告");
  for (const field of ["cpuAvailable", "memoryAvailable", "diskAvailable"]) {
    assert.equal(deriveNodeHealth({ ...healthy, [field]: false }), "警告");
  }
});

test("overview recomputes every projection from the authorized non-revoked Agent set", async () => {
  const repository = new MemoryAgentControlRepository();
  await repository.update((state) => {
    state.nodes.push(
      agentNode(nodeIds.allowed, "allowed-agent", telemetry("allowed-agent", 90, 4, 1, 100, 500)),
      agentNode(nodeIds.hidden, "hidden-agent", telemetry("hidden-agent", 100, 100, 0, 100, 100)),
      agentNode(nodeIds.revoked, "revoked-agent", telemetry("revoked-agent", 100, 100, 0, 100, 100), { revokedAt: new Date().toISOString(), status: "revoked" }),
    );
    state.tasks.push(
      remoteTask("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", nodeIds.allowed, "allowed-task-log"),
      remoteTask("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", nodeIds.hidden, "hidden-task-log"),
      remoteTask("cccccccc-cccc-4ccc-8ccc-cccccccccccc", nodeIds.revoked, "revoked-task-log"),
    );
    state.audits.push(
      auditEvent("aaaaaaaa-0000-4000-8000-000000000001", nodeIds.allowed, "allowed-audit"),
      auditEvent("bbbbbbbb-0000-4000-8000-000000000002", nodeIds.hidden, "hidden-audit"),
      auditEvent("cccccccc-0000-4000-8000-000000000003", nodeIds.revoked, "revoked-audit"),
      auditEvent("dddddddd-0000-4000-8000-000000000004", null, "global-enrollment-audit"),
    );
  });
  const overview = new OverviewService(new FakePlatformAdapter(), new MemoryTaskStateRepository(), repository);
  const access = { nodeScope: [nodeIds.allowed], canReadTasks: true, canReadAudit: true };
  const payload = await overview.getOverview(access);

  assert.deepEqual(payload.nodes.map((node) => node.id), ["node-local", nodeIds.allowed]);
  assert.deepEqual(Object.keys(payload.resources).sort(), ["cluster", "node-local", nodeIds.allowed].sort());
  assert.deepEqual(payload.resources.cluster.map((item) => item.value), ["51%", "45%", "50%", "0.55"]);
  assert.equal(payload.metrics.find((item) => item.label === "异常节点").value, "1");
  assert.equal(payload.cluster.health, "警告");
  assert.equal(payload.nodes.find((node) => node.id === nodeIds.allowed).status, "警告");
  assert.equal(payload.risks.some((risk) => risk.id === `risk-agent-${nodeIds.allowed}-cpu`), true);
  const serialized = JSON.stringify(payload);
  assert.match(serialized, /allowed-task-log|allowed-audit/);
  assert.doesNotMatch(serialized, /hidden-agent|hidden-task-log|hidden-audit|revoked-agent|revoked-task-log|revoked-audit|global-enrollment-audit/);

  const withoutDetails = await overview.getOverview({ nodeScope: [nodeIds.allowed], canReadTasks: false, canReadAudit: false });
  assert.deepEqual(withoutDetails.tasks.map((task) => task.id), ["task-test"]);
  assert.equal(withoutDetails.audits.length, 1);
  const localOnly = await overview.getOverview({ nodeScope: [], canReadTasks: true, canReadAudit: true });
  assert.deepEqual(localOnly.nodes.map((node) => node.id), ["node-local"]);
  assert.deepEqual(localOnly.resources.cluster.map((item) => item.value), ["12%", "38%", "80%", "0.10"]);
});

test("overview merges a Controller mirror without losing Agent tasks or audits", async () => {
  const repository = new MemoryAgentControlRepository();
  const taskId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const auditId = "aaaaaaaa-0000-4000-8000-000000000001";
  await repository.update((state) => {
    state.nodes.push(agentNode(
      nodeIds.allowed,
      "fake-host",
      { ...telemetry("fake-host", 99, 100, 0, 100, 100), primaryIp: "127.0.0.1" },
      { physicalHostId: localPhysicalHostId },
    ));
    state.tasks.push(remoteTask(taskId, nodeIds.allowed, "mirror-task-log"));
    state.audits.push(auditEvent(auditId, nodeIds.allowed, "mirror-audit"));
  });

  const payload = await new OverviewService(
    new FakePlatformAdapter(),
    new MemoryTaskStateRepository(),
    repository,
  ).getOverview();

  assert.deepEqual(payload.nodes.map((node) => node.id), ["node-local"]);
  assert.deepEqual(Object.keys(payload.resources).sort(), ["cluster", "node-local"]);
  assert.deepEqual(payload.resources.cluster.map((item) => item.value), ["12%", "38%", "80%", "0.10"]);
  assert.equal(payload.metrics.find((item) => item.label === "异常节点").value, "0");
  assert.equal(payload.risks.some((risk) => risk.id.startsWith(`risk-agent-${nodeIds.allowed}-`)), false);
  assert.equal(payload.nodes[0].services.at(-1).name, "StackPilot Agent 控制通道");
  assert.equal(payload.nodes[0].services.at(-1).status, "健康");
  assert.equal(payload.tasks.some((task) => task.id === taskId && task.logs.includes("mirror-task-log")), true);
  assert.equal(JSON.stringify(payload.audits).includes("mirror-audit"), true);
});

test("overview surfaces a mirrored Agent outage without counting host resources twice", async () => {
  const repository = new MemoryAgentControlRepository();
  const stale = new Date(Date.now() - 120_000).toISOString();
  await repository.update((state) => state.nodes.push(agentNode(
    nodeIds.allowed,
    "fake-host",
    { ...telemetry("fake-host", 99, 100, 0, 100, 100), primaryIp: "127.0.0.1", collectedAt: stale },
    { physicalHostId: localPhysicalHostId, lastSeenAt: stale },
  )));

  const payload = await new OverviewService(new FakePlatformAdapter(), new MemoryTaskStateRepository(), repository).getOverview();

  assert.deepEqual(payload.nodes.map((node) => node.id), ["node-local"]);
  assert.equal(payload.nodes[0].status, "警告");
  assert.equal(payload.nodes[0].services.at(-1).status, "离线");
  assert.equal(payload.cluster.health, "警告");
  assert.equal(payload.metrics.find((item) => item.label === "异常节点").value, "1");
  assert.equal(payload.risks.some((risk) => risk.id === `risk-agent-${nodeIds.allowed}-offline`), true);
  assert.deepEqual(payload.resources.cluster.map((item) => item.value), ["12%", "38%", "80%", "0.10"]);
});

test("overview distinguishes enrollment grace, offline heartbeat and stale telemetry with stable risk IDs", async () => {
  const repository = new MemoryAgentControlRepository();
  const recent = new Date().toISOString();
  const old = new Date(Date.now() - 60_000).toISOString();
  await repository.update((state) => state.nodes.push(
    agentNode(nodeIds.allowed, "recent-awaiting", undefined, { status: "pending", enrolledAt: recent, lastSeenAt: null }),
    agentNode(nodeIds.hidden, "old-awaiting", undefined, { status: "pending", enrolledAt: old, lastSeenAt: null }),
    agentNode(nodeIds.revoked, "stale-telemetry", telemetry("stale-telemetry", 10, 1, 1, 0, 1, old), { lastSeenAt: recent }),
    agentNode("44444444-4444-4444-8444-444444444444", "legacy-offline", undefined, { lastSeenAt: old }),
  ));
  const overview = new OverviewService(new FakePlatformAdapter(), new MemoryTaskStateRepository(), repository);
  const payload = await overview.getOverview();
  const recentNode = payload.nodes.find((node) => node.id === nodeIds.allowed);
  const oldNode = payload.nodes.find((node) => node.id === nodeIds.hidden);
  const staleNode = payload.nodes.find((node) => node.id === nodeIds.revoked);
  const legacyOffline = payload.nodes.find((node) => node.id === "44444444-4444-4444-8444-444444444444");

  assert.deepEqual([recentNode.status, recentNode.freshness], ["维护", "awaiting"]);
  assert.deepEqual([oldNode.status, oldNode.freshness], ["维护", "awaiting"]);
  assert.deepEqual([staleNode.status, staleNode.freshness], ["警告", "stale"]);
  assert.deepEqual([legacyOffline.status, legacyOffline.freshness], ["离线", "stale"]);
  const ids = new Set(payload.risks.map((risk) => risk.id));
  assert.equal(ids.has(`risk-agent-${nodeIds.allowed}-awaiting`), true);
  assert.equal(ids.has(`risk-agent-${nodeIds.allowed}-offline`), false);
  assert.equal(ids.has(`risk-agent-${nodeIds.hidden}-awaiting`), true);
  assert.equal(ids.has(`risk-agent-${nodeIds.hidden}-offline`), false);
  assert.equal(ids.has(`risk-agent-${nodeIds.revoked}-telemetry-stale`), true);
  assert.equal(ids.has(`risk-agent-${nodeIds.revoked}-offline`), false);
  assert.equal(ids.has("risk-agent-44444444-4444-4444-8444-444444444444-offline"), true);
  assert.equal(ids.has("risk-agent-44444444-4444-4444-8444-444444444444-awaiting"), false);
});

test("overview projects expired tasks, unavailable metrics and precise memory capacity", async () => {
  const repository = new MemoryAgentControlRepository();
  const task = remoteTask("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", nodeIds.allowed, "expired-task");
  await repository.update((state) => {
    state.nodes.push(agentNode(nodeIds.allowed, "partial-agent", { ...telemetry("partial-agent", 10, 1, 0.5, 1, 2), cpu: null }));
    state.tasks.push({ ...task, status: "queued", expiresAt: new Date(Date.now() - 1).toISOString() });
  });
  const platform = new FakePlatformAdapter();
  const originalCollect = platform.collectSnapshot.bind(platform);
  platform.collectSnapshot = async () => ({
    ...await originalCollect(), totalMemoryBytes: gib / 2, availableMemoryBytes: gib / 4, memoryPercent: 50,
  });
  const payload = await new OverviewService(platform, new MemoryTaskStateRepository(), repository).getOverview();
  assert.equal(payload.tasks.find((item) => item.id === task.taskId).status, "过期");
  assert.equal(payload.nodes.find((item) => item.id === nodeIds.allowed).status, "警告");
  assert.equal(payload.resources.cluster.find((item) => item.label === "内存使用率").value, "50%");
});

test("overview single-flight shares failures, clears rejected work and caches recovered samples", async () => {
  const platform = new FakePlatformAdapter();
  platform.failSnapshot = true;
  const overview = new OverviewService(platform, new MemoryTaskStateRepository());
  const failed = await Promise.allSettled([overview.getOverview(), overview.getOverview()]);
  assert.deepEqual(failed.map((item) => item.status), ["rejected", "rejected"]);
  assert.equal(platform.calls.collectSnapshot, 1);

  platform.failSnapshot = false;
  await overview.getOverview();
  await overview.getOverview();
  assert.equal(platform.calls.collectSnapshot, 2);
  await overview.getOverview(undefined, { bypassCache: true });
  assert.equal(platform.calls.collectSnapshot, 3);
});

test("explicit overview collection does not reuse or lose to an ordinary in-flight sample", async () => {
  const templatePlatform = new FakePlatformAdapter();
  const template = await templatePlatform.collectSnapshot();
  const platform = new FakePlatformAdapter();
  let releaseFirst;
  let markFirstStarted;
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  const firstRelease = new Promise((resolve) => { releaseFirst = resolve; });
  platform.collectSnapshot = async () => {
    platform.calls.collectSnapshot += 1;
    const call = platform.calls.collectSnapshot;
    if (call === 1) { markFirstStarted(); await firstRelease; }
    return { ...template, node: { ...template.node, name: `sample-${call}` } };
  };
  const overview = new OverviewService(platform, new MemoryTaskStateRepository());
  const ordinary = overview.getOverview();
  await firstStarted;
  const forced = await Promise.all([
    overview.getOverview(undefined, { bypassCache: true }),
    overview.getOverview(undefined, { bypassCache: true }),
  ]);
  assert.equal(platform.calls.collectSnapshot, 2);
  assert.deepEqual(forced.map((payload) => payload.nodes[0].name), ["sample-2", "sample-2"]);
  releaseFirst();
  assert.equal((await ordinary).nodes[0].name, "sample-1");
  assert.equal((await overview.getOverview()).nodes[0].name, "sample-2");
  assert.equal(platform.calls.collectSnapshot, 2);
});

test("overview excludes unavailable local resource values instead of projecting zero", async () => {
  const platform = new FakePlatformAdapter();
  const originalCollect = platform.collectSnapshot.bind(platform);
  platform.collectSnapshot = async () => {
    const snapshot = await originalCollect();
    return {
      ...snapshot,
      node: { ...snapshot.node, status: "警告", cpu: "暂不可用", memory: "暂不可用", disk: "暂不可用", availability: { ...snapshot.node.availability, cpu: false, memory: false, disk: false } },
      cpuPercent: 0, memoryPercent: 0, diskPercent: 0, cpuCorePercents: [], totalMemoryBytes: 0, availableMemoryBytes: 0, disks: [],
    };
  };
  const payload = await new OverviewService(platform, new MemoryTaskStateRepository()).getOverview();
  assert.equal(payload.nodes[0].status, "警告");
  assert.deepEqual(payload.metrics.slice(0, 3).map((metric) => [metric.value, metric.line]), [["暂不可用", []], ["暂不可用", []], ["暂不可用", []]]);
  assert.deepEqual(payload.resources.cluster.slice(0, 3).map((metric) => [metric.value, metric.values]), [["暂不可用", []], ["暂不可用", []], ["暂不可用", []]]);
  assert.deepEqual(payload.resources["node-local"].slice(0, 3).map((metric) => [metric.value, metric.values]), [["暂不可用", []], ["暂不可用", []], ["暂不可用", []]]);
});

test("overview omits missing load and averages only available load samples", async () => {
  const platform = new FakePlatformAdapter();
  const originalCollect = platform.collectSnapshot.bind(platform);
  platform.collectSnapshot = async () => ({ ...await originalCollect(), loadAverages: [] });
  const localOnly = await new OverviewService(platform, new MemoryTaskStateRepository()).getOverview();
  assert.deepEqual(localOnly.resources["node-local"].at(-1), { label: "系统负载", value: "暂不可用", delta: "等待采集", values: [], collectedAt: localOnly.collectedAt, freshness: "current" });
  assert.deepEqual(localOnly.resources.cluster.at(-1), { label: "系统负载", value: "暂不可用", delta: "等待采集", values: [], collectedAt: localOnly.collectedAt, freshness: "current" });

  const repository = new MemoryAgentControlRepository();
  await repository.update((state) => state.nodes.push(agentNode(nodeIds.allowed, "load-agent", telemetry("load-agent", 10, 1, 0.5, 1, 2))));
  const withAgent = await new OverviewService(platform, new MemoryTaskStateRepository(), repository).getOverview();
  assert.deepEqual(withAgent.resources.cluster.at(-1), { label: "系统负载", value: "1.00", delta: "1 个实时节点", values: [1, 2, 3], collectedAt: withAgent.collectedAt, freshness: "current" });
});

test("overview labels Windows equivalent load without excluding it from mixed cluster averages", async () => {
  const platform = new FakePlatformAdapter();
  const originalCollect = platform.collectSnapshot.bind(platform);
  platform.collectSnapshot = async () => ({ ...await originalCollect(), loadAverages: [] });
  const repository = new MemoryAgentControlRepository();
  await repository.update((state) => state.nodes.push(
    agentNode(nodeIds.allowed, "windows-agent", { ...telemetry("windows-agent", 25, 8, 4, 1, 2), loadAverage: [3, 2, 1] }, { platform: "win32" }),
    agentNode(nodeIds.hidden, "linux-agent", { ...telemetry("linux-agent", 25, 8, 4, 1, 2), loadAverage: [1, 2, 3] }),
    agentNode(nodeIds.revoked, "legacy-windows-agent", { ...telemetry("legacy-windows-agent", 25, 8, 4, 1, 2), loadAverage: null }, { platform: "win32" }),
    agentNode("44444444-4444-4444-8444-444444444444", "offline-windows-agent", { ...telemetry("offline-windows-agent", 25, 8, 4, 1, 2), loadAverage: [9, 9, 9] }, { platform: "win32", status: "offline" }),
  ));

  const overview = await new OverviewService(platform, new MemoryTaskStateRepository(), repository).getOverview();
  assert.deepEqual(overview.resources.cluster.at(-1), { label: "系统负载", value: "2.00", delta: "2 个实时节点 · 1 个 Windows 等效值", values: [2, 2, 2], collectedAt: overview.collectedAt, freshness: "current" });
  assert.deepEqual(overview.resources[nodeIds.allowed].at(-1), { label: "系统负载", value: "3.00", delta: "Windows 等效负载", values: [3, 2, 1], collectedAt: overview.resources[nodeIds.allowed][0].collectedAt, freshness: "current" });
  assert.equal(overview.resources[nodeIds.hidden].at(-1).delta, "linux-agent");
  assert.deepEqual(overview.resources[nodeIds.revoked].at(-1), { label: "系统负载", value: "暂不可用", delta: "等待采集", values: [], collectedAt: overview.resources[nodeIds.revoked][0].collectedAt, freshness: "current" });
  assert.equal(overview.resources["44444444-4444-4444-8444-444444444444"].at(-1).freshness, "stale");
});

test("schedule service performs storage and execution only through injected interfaces", async () => {
  const platform = new FakePlatformAdapter();
  const repository = new MemoryScheduleRepository();
  const schedules = new ScheduleService(repository, platform);
  const created = await schedules.create({ name: "backup", cron: "0 4 * * *", command: "true", enabled: true });
  assert.equal(created.job.name, "backup");
  assert.equal((await schedules.update(created.job.id, { enabled: false })).job.enabled, false);
  const run = await schedules.run(created.job.id);
  assert.equal(run.job.result, "成功");
  assert.equal(platform.calls.runScheduledCommand, 1);
  await schedules.delete(created.job.id);
  assert.equal((await schedules.list()).jobs.length, 0);
});

test("crontab repository rejects malformed managed metadata", async () => {
  const platform = new FakePlatformAdapter();
  const invalid = Buffer.from(JSON.stringify({ id: "bad", command: 42 }), "utf8").toString("base64url");
  platform.crontab = `external line\n# >>> STACKPILOT MANAGED CRON JOBS\n# stackpilot:job=${invalid}\n# <<< STACKPILOT MANAGED CRON JOBS\n`;
  const state = await new CrontabScheduleRepository(platform).read();
  assert.deepEqual(state.externalLines, ["external line"]);
  assert.deepEqual(state.jobs, []);
});
