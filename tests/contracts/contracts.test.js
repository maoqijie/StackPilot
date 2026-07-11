import assert from "node:assert/strict";
import test from "node:test";
import {
  API_CLIENT_PREFIX, API_ROOT_SEGMENTS, ApiErrorResponseSchema, CreateScheduleJobRequestSchema,
  OverviewSummaryPayloadSchema, PathIdSchema, WRITE_METHODS,
  AGENT_PROTOCOL_VERSION, AgentHeartbeatSchema, CreateRemoteTaskRequestSchema, isAgentProtocolCompatible,
  CreateApiTokenRequestSchema, LoginRequestSchema, UpdateUserAccessRequestSchema,
} from "@stackpilot/contracts";

test("shared API constants preserve the existing HTTP contract", () => {
  assert.equal(API_CLIENT_PREFIX, "/api");
  assert.deepEqual(API_ROOT_SEGMENTS, ["api", "overview"]);
  assert.deepEqual(WRITE_METHODS, ["POST", "PATCH", "DELETE"]);
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
