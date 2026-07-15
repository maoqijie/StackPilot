import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createStackPilotServer } from "../../apps/controller/dist/server.js";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { IdentityService } from "../../apps/controller/dist/identity/identityService.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";

const password = "correct horse battery staple";
const allowedNodeId = "11111111-1111-4111-8111-111111111111";
const hiddenNodeId = "22222222-2222-4222-8222-222222222222";

async function withServer(callback) {
  const database = openDatabase(":memory:");
  const identity = new IdentityService(database, Buffer.alloc(32, 4));
  await identity.createInitialAdministrator("admin", "Administrator", password);
  const server = createStackPilotServer({ env: { STACKPILOT_COOKIE_SECURE: "0" }, database, identity, platform: new FakePlatformAdapter() });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try { await callback(`http://127.0.0.1:${server.address().port}`, { database, identity }); }
  finally { server.close(); await once(server, "close"); database.close(); }
}

async function auditRequest(base, identity, username = "admin", query = "") {
  const login = await identity.login(username, password, "audit-test", "node-test");
  return fetch(`${base}/api/audit${query}`, { headers: { Cookie: `stackpilot_session=${login.sessionToken}` } });
}

test("audit API applies node scope before its limit and total", async () => withServer(async (base, { identity }) => {
  const admin = (await identity.login("admin", password, "setup", "node-test")).principal;
  await identity.createUser(admin, "scoped-reader", "Scoped Reader", password, ["audit-reader"], [allowedNodeId]);
  identity.audit.append({ actorType: "agent", actorId: allowedNodeId, source: "controller-agent", targetType: "node", targetId: allowedNodeId, action: "node.allowed", outcome: "success", authorization: "signed-agent", requestId: randomUUID() });
  identity.audit.append({ actorType: "agent", actorId: hiddenNodeId, source: "controller-agent", targetType: "node", targetId: hiddenNodeId, action: "node.hidden", outcome: "success", authorization: "signed-agent", requestId: randomUUID() });
  identity.audit.append({ actorType: "user", actorId: admin.userId, source: "controller", action: "global.hidden", outcome: "success", authorization: "session", requestId: randomUUID() });
  identity.audit.append({ actorType: "user", actorId: admin.userId, source: "database-controller", targetType: "database-operation", targetId: randomUUID(), action: "database.allowed", parameters: { nodeId: allowedNodeId }, outcome: "queued", authorization: "node-scope", requestId: randomUUID() });

  const response = await auditRequest(base, identity, "scoped-reader");
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(new Set(payload.events.map((event) => event.action)), new Set(["node.allowed", "database.allowed"]));
  assert.equal(payload.total, 2);
}));

test("audit API filters before its limit and paginates without gaps", async () => withServer(async (base, { identity }) => {
  for (let index = 0; index < 200; index += 1) identity.audit.append({ actorType: "user", actorId: "operator", source: "controller", targetType: "node", targetId: allowedNodeId, action: `audit.success.${index}`, outcome: "success", authorization: "allowed", requestId: randomUUID() });
  identity.audit.append({ actorType: "user", actorId: "operator", source: "controller", targetType: "node", targetId: allowedNodeId, action: "audit.queued", outcome: "queued", authorization: "allowed", requestId: randomUUID() });
  identity.audit.append({ actorType: "user", actorId: "operator", source: "database-controller", targetType: "node", targetId: allowedNodeId, action: "audit.oldest.failure", outcome: "denied", authorization: "denied", requestId: randomUUID() });

  const failure = await auditRequest(base, identity, "admin", "?result=failure&limit=1");
  assert.equal(failure.status, 200);
  const failurePayload = await failure.json();
  assert.deepEqual(failurePayload.events.map((event) => event.action), ["audit.oldest.failure"]);
  assert.equal(failurePayload.total, 1);

  const success = await auditRequest(base, identity, "admin", "?result=success&limit=1000");
  const successPayload = await success.json();
  assert.equal(successPayload.total, 200);
  assert.equal(successPayload.events.some((event) => event.action === "audit.queued"), false);

  const first = await auditRequest(base, identity, "admin", "?actor=operator&source=controller&search=audit&limit=100");
  const firstPayload = await first.json();
  assert.equal(firstPayload.events.length, 100);
  assert.equal(typeof firstPayload.nextCursor, "number");
  const second = await auditRequest(base, identity, "admin", `?actor=operator&source=controller&search=audit&limit=100&beforeSequence=${firstPayload.nextCursor}`);
  const secondPayload = await second.json();
  assert.equal(secondPayload.events.length, 100);
  assert.equal(typeof secondPayload.nextCursor, "number");
  const third = await auditRequest(base, identity, "admin", `?actor=operator&source=controller&search=audit&limit=100&beforeSequence=${secondPayload.nextCursor}`);
  const thirdPayload = await third.json();
  assert.equal(thirdPayload.events.length, 1);
  const ids = [...firstPayload.events, ...secondPayload.events, ...thirdPayload.events].map((event) => event.eventId);
  assert.equal(new Set(ids).size, 201);
  assert.equal(thirdPayload.nextCursor, null);
  assert.equal(secondPayload.total, 201);
}));

test("audit API rejects unknown, duplicate and invalid query parameters", async () => withServer(async (base, { identity }) => {
  for (const query of ["?unknown=1", "?result=failed", "?limit=0", "?beforeSequence=1.5", "?search=%20", "?actor=a&actor=b"]) {
    const response = await auditRequest(base, identity, "admin", query);
    assert.equal(response.status, 400, query);
  }
}));

test("node-scoped audit plans use the node sequence index", async () => withServer(async (_base, { database, identity }) => {
  identity.audit.append({ actorType: "agent", actorId: allowedNodeId, source: "controller-agent", targetType: "node", targetId: allowedNodeId, action: "node.indexed", outcome: "success", authorization: "signed-agent", requestId: randomUUID() });
  const listPlan = database.prepare("EXPLAIN QUERY PLAN SELECT sequence FROM audit_events WHERE node_id IN (?) ORDER BY sequence DESC LIMIT 201").all(allowedNodeId).map((row) => row.detail).join("\n");
  const countPlan = database.prepare("EXPLAIN QUERY PLAN SELECT count(*) FROM audit_events WHERE node_id IN (?)").all(allowedNodeId).map((row) => row.detail).join("\n");
  assert.match(listPlan, /audit_events_node_sequence_idx/);
  assert.match(countPlan, /audit_events_node_sequence_idx/);
}));

test("audit API bounds new and historical oversized rows", async () => withServer(async (base, { database, identity }) => {
  const oversized = "x".repeat(20_000);
  identity.audit.append({ actorType: oversized, actorId: oversized, source: oversized, targetType: oversized, targetId: oversized, action: oversized, parameters: { value: oversized }, outcome: oversized, authorization: oversized, requestId: oversized, traceId: oversized });
  database.prepare("INSERT INTO audit_events(event_id,occurred_at,actor_type,actor_id,source,target_type,target_id,action,parameters,outcome,authorization,request_id,trace_id,previous_hash,event_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(randomUUID(), new Date().toISOString(), oversized, oversized, oversized, oversized, oversized, oversized, oversized, oversized, oversized, oversized, oversized, "0".repeat(64), "c".repeat(64));

  const response = await auditRequest(base, identity);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.events.length, 2);
  for (const event of payload.events) {
    assert(event.targetId.length <= 2_048);
    assert(event.parameters.length <= 16_384);
    assert(event.authorization.length <= 4_096);
  }
}));
