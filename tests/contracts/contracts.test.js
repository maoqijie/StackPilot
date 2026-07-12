import assert from "node:assert/strict";
import test from "node:test";
import {
  API_CLIENT_PREFIX, API_ROOT_SEGMENTS, ApiErrorResponseSchema, CreateScheduleJobRequestSchema,
  OverviewSummaryPayloadSchema, PathIdSchema, WRITE_METHODS,
  AGENT_PROTOCOL_VERSION, AgentHeartbeatSchema, AgentTelemetrySnapshotSchema, HostMonitoringRecordSchema, CreateRemoteTaskRequestSchema, isAgentProtocolCompatible,
  CreateApiTokenRequestSchema, LoginRequestSchema, UpdateUserAccessRequestSchema,
} from "@stackpilot/contracts";

test("shared API constants preserve the existing HTTP contract", () => {
  assert.equal(API_CLIENT_PREFIX, "/api");
  assert.deepEqual(API_ROOT_SEGMENTS, ["api", "overview"]);
  assert.deepEqual(WRITE_METHODS, ["POST", "PATCH", "DELETE"]);
});

test("agent telemetry remains optional and strictly validates bounded snapshots", () => {
  const baseHeartbeat = { nodeId: crypto.randomUUID(), agentVersion: "0.1.0", protocolVersion: "1.0", timestamp: new Date().toISOString(), platform: "linux", capabilities: ["system.summary.read"], health: { status: "healthy", uptimeSeconds: 1 } };
  assert.equal(AgentHeartbeatSchema.safeParse(baseHeartbeat).success, true);
  const telemetry = {
    collectedAt: new Date().toISOString(), hostname: "node-1", primaryIp: "192.0.2.1",
    cpu: { usagePercent: 25.5, coreUsagePercents: [20, 31] },
    memory: { totalBytes: 1024, availableBytes: 512 }, loadAverage: [0.2, 0.3, 0.4],
    disks: [{ label: "/dev/sda1", mount: "/", totalBytes: 2048, usedBytes: 1024 }], uptimeSeconds: 60,
  };
  assert.equal(AgentHeartbeatSchema.safeParse({ ...baseHeartbeat, telemetry }).success, true);
  assert.equal(AgentTelemetrySnapshotSchema.safeParse({ ...telemetry, collectedAt: "2026-07-12" }).success, false);
  assert.equal(AgentTelemetrySnapshotSchema.safeParse({ ...telemetry, secret: "forbidden" }).success, false);
  assert.equal(AgentTelemetrySnapshotSchema.safeParse({ ...telemetry, cpu: { ...telemetry.cpu, extra: true } }).success, false);
  assert.equal(AgentTelemetrySnapshotSchema.safeParse({ ...telemetry, disks: Array.from({ length: 257 }, () => telemetry.disks[0]) }).success, false);
  assert.equal(AgentTelemetrySnapshotSchema.safeParse({ ...telemetry, cpu: { usagePercent: 25, coreUsagePercents: Array(513).fill(25) } }).success, false);
  assert.equal(AgentTelemetrySnapshotSchema.safeParse({ ...telemetry, memory: { totalBytes: 100, availableBytes: 101 } }).success, false);
  assert.equal(AgentTelemetrySnapshotSchema.safeParse({ ...telemetry, disks: [{ ...telemetry.disks[0], usedBytes: 4096 }] }).success, false);
});

test("host monitoring contract preserves raw nullable metrics", () => {
  const host = { id: "controller-local", source: "controller", name: "controller", platform: "linux", address: null, environment: "未分类", owner: "未分配", connectionStatus: "local", healthStatus: "unknown", telemetryFreshness: "current", telemetryCollectedAt: null, lastSeenAt: null, cpuPercent: null, memory: null, disk: null, uptimeSeconds: null, backup: null, services: [], version: "0.2.0", latency: null, updateStatus: null };
  assert.equal(HostMonitoringRecordSchema.safeParse(host).success, true);
  assert.equal(HostMonitoringRecordSchema.safeParse({ ...host, memory: { totalBytes: 100, usedBytes: 101, percent: 50 } }).success, false);
  assert.equal(HostMonitoringRecordSchema.safeParse({ ...host, cpuPercent: 101 }).success, false);
});

test("identity schemas reject privilege fields and invalid node scopes", () => {
  assert.equal(LoginRequestSchema.safeParse({ username: "admin", password: "password", role: "administrator" }).success, false);
  assert.equal(CreateApiTokenRequestSchema.safeParse({ name: "reader", permissions: ["overview:read"], nodeScope: "all", expiresAt: null }).success, true);
  assert.equal(CreateApiTokenRequestSchema.safeParse({ name: "bad", permissions: ["unknown:permission"], nodeScope: "all", expiresAt: null }).success, false);
  assert.equal(UpdateUserAccessRequestSchema.safeParse({ roleIds: ["operator"], nodeScope: ["not-a-uuid"], disabled: false }).success, false);
});

test("agent protocol schemas reject incompatible and generic command tasks", () => {
  assert.equal(AGENT_PROTOCOL_VERSION, "1.0");
  assert.equal(isAgentProtocolCompatible("1.9"), true);
  assert.equal(isAgentProtocolCompatible("2.0"), false);
  assert.equal(CreateRemoteTaskRequestSchema.safeParse({ type: "run-shell", parameters: { command: "id" }, expiresInSeconds: 60, idempotencyKey: "generic-command" }).success, false);
  assert.equal(AgentHeartbeatSchema.safeParse({ nodeId: crypto.randomUUID(), agentVersion: "0.1.0", protocolVersion: "1.0", timestamp: new Date().toISOString(), platform: "linux", capabilities: ["system.summary.read"], health: { status: "healthy", uptimeSeconds: 1 }, token: "forbidden" }).success, false);
});

test("shared schemas validate external request and error contracts at runtime", () => {
  assert.equal(PathIdSchema.safeParse("node-local").success, true);
  assert.equal(PathIdSchema.safeParse("../node").success, false);
  assert.equal(CreateScheduleJobRequestSchema.safeParse({ name: "backup", cron: "0 4 * * *", command: "true", extra: true }).success, false);
  assert.equal(ApiErrorResponseSchema.safeParse({ code: "BAD_REQUEST", error: "invalid", requestId: "request-1" }).success, true);
  assert.equal(OverviewSummaryPayloadSchema.safeParse({}).success, false);
});
