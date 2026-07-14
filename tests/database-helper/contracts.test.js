import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_PROTOCOL_VERSION, AgentDatabaseOperationDispatchSchema, DatabaseHelperRequestSchema,
} from "../../packages/contracts/dist/index.js";

const base = { operationId: "11111111-1111-4111-8111-111111111111", version: 1, kind: "terminate-session", parameters: { kind: "terminate-session", instanceLocalId: "orders", sessionId: "42" }, idempotencyKey: "terminate-42", expiresAt: new Date(Date.now() + 60_000).toISOString() };

test("Agent 1.1 database contracts reject generic commands, paths and mismatched kinds", () => {
  assert.equal(AGENT_PROTOCOL_VERSION, "1.1");
  assert.equal(AgentDatabaseOperationDispatchSchema.safeParse(base).success, true);
  assert.equal(AgentDatabaseOperationDispatchSchema.safeParse({ ...base, kind: "restore" }).success, false);
  assert.equal(DatabaseHelperRequestSchema.safeParse({ action: "shell", command: "id" }).success, false);
  assert.equal(DatabaseHelperRequestSchema.safeParse({ action: "execute", operation: { ...base, parameters: { ...base.parameters, instanceLocalId: "../../etc" } } }).success, false);
  assert.equal(DatabaseHelperRequestSchema.safeParse({ action: "execute", operation: { ...base, parameters: { ...base.parameters, sessionId: "42;DROP TABLE users" } } }).success, false);
});
