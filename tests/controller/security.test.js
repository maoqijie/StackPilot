import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createMemoryLogger } from "../../apps/controller/dist/logging/logger.js";
import { createStackPilotServer } from "../../apps/controller/dist/server.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { IdentityService } from "../../apps/controller/dist/identity/identityService.js";

const validToken = "test-token-that-is-not-used-outside-tests";
const allowedOrigin = "http://127.0.0.1:5173";

async function withServer(env, callback, setup = {}) {
  const platform = setup.platform ?? new FakePlatformAdapter();
  const logger = setup.logger ?? createMemoryLogger();
  const database = openDatabase(":memory:");
  const identity = new IdentityService(database, Buffer.alloc(32, 7));
  await identity.createInitialAdministrator("admin", "Administrator", "correct horse battery staple");
  const login = await identity.login("admin", "correct horse battery staple", "test", "node-test");
  const apiToken = identity.createApiToken(login.principal, { name: "tests", permissions: [...login.principal.permissions], nodeScope: "all", expiresAt: null }).token;
  const server = createStackPilotServer({ env: { STACKPILOT_COOKIE_SECURE: "0", ...env }, platform, logger, database, identity, ...(setup.services ? { services: setup.services } : {}) });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await callback(baseUrl, { platform, logger, apiToken, identity, database });
  } finally {
    server.close();
    await once(server, "close");
    database.close();
  }
}

async function jsonResponse(response) {
  return { status: response.status, headers: response.headers, body: await response.json() };
}

function authHeaders(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extra };
}

async function authenticatedSession(baseUrl) {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "correct horse battery staple" }),
  });
  const body = await login.json();
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const headers = (proof) => ({
    Origin: allowedOrigin, Cookie: cookie, "X-CSRF-Token": body.csrfToken, "Content-Type": "application/json",
    ...(proof ? { "X-Reauth-Proof": proof } : {}),
  });
  const reauthenticate = async () => (await (await fetch(`${baseUrl}/api/auth/reauthenticate`, {
    method: "POST", headers: headers(), body: JSON.stringify({ password: "correct horse battery staple" }),
  })).json()).proof;
  return { headers, reauthenticate };
}

test("liveness and readiness remain public while business reads require authentication", async () => {
  await withServer({}, async (baseUrl, { apiToken }) => {
    const health = await jsonResponse(await fetch(`${baseUrl}/healthz`));
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
    assert.deepEqual(await (await fetch(`${baseUrl}/readyz`)).json(), { ready: true, service: "stackpilot-api" });
    assert.equal((await fetch(`${baseUrl}/api/overview`)).status, 401);
    const overview = await jsonResponse(await fetch(`${baseUrl}/api/overview`, { headers: authHeaders(apiToken) }));
    assert.equal(overview.status, 200);
    assert.equal(overview.body.nodes[0].id, "node-local");
  });
});

test("readiness reports dependency state without exposing system details", async () => {
  const platform = new FakePlatformAdapter();
  platform.ready = false;
  await withServer({}, async (baseUrl) => {
    const response = await jsonResponse(await fetch(`${baseUrl}/readyz`));
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { ready: false, service: "stackpilot-api" });
  }, { platform });
});

test("POST, PATCH and DELETE reject missing or invalid identities before platform access", async () => {
  await withServer({}, async (baseUrl, { platform }) => {
    for (const method of ["POST", "PATCH", "DELETE"]) {
      const missing = await jsonResponse(await fetch(`${baseUrl}/api/overview/not-a-route`, { method }));
      assert.equal(missing.status, 401);
      assert.equal(missing.body.code, "UNAUTHORIZED");
      assert.equal(missing.headers.get("www-authenticate"), "Bearer");

      const forged = await jsonResponse(await fetch(`${baseUrl}/api/overview/not-a-route`, {
        method,
        headers: { Authorization: "Bearer wrong-token", "X-Forwarded-For": "127.0.0.1", "X-Forwarded-Host": "localhost", "X-Forwarded-Proto": "https" },
      }));
      assert.equal(forged.status, 401);
      assert.doesNotMatch(JSON.stringify(forged.body), /wrong-token|test-token/);
    }
    assert.equal(platform.calls.writeCrontab, 0);
    assert.equal(platform.calls.runScheduledCommand, 0);
  });
});

test("Agent control-plane reads require an authorized API token", async () => {
  await withServer({}, async (baseUrl, { apiToken }) => {
    const missing = await jsonResponse(await fetch(`${baseUrl}/api/nodes`)); assert.equal(missing.status, 401);
    const allowed = await jsonResponse(await fetch(`${baseUrl}/api/nodes`, { headers: authHeaders(apiToken) })); assert.equal(allowed.status, 200); assert.deepEqual(allowed.body.nodes, []);
  });
});

test("administrator control-plane APIs manage enrollment, nodes and task status without exposing credentials", async () => {
  const repository = new (await import("../../apps/controller/dist/repositories/agentControlRepository.js")).MemoryAgentControlRepository();
  const platform = new FakePlatformAdapter();
  const config = (await import("../../apps/controller/dist/config/environment.js")).loadControllerConfig({});
  const services = (await import("../../apps/controller/dist/app.js")).createControllerServices(platform, process.cwd(), config, repository);
  const pair = (await import("node:crypto")).generateKeyPairSync("ed25519");
  await withServer({}, async (baseUrl, { apiToken }) => {
    const loginResponse=await fetch(`${baseUrl}/api/auth/login`,{method:"POST",headers:{Origin:allowedOrigin,"Content-Type":"application/json"},body:JSON.stringify({username:"admin",password:"correct horse battery staple"})});const loginBody=await loginResponse.json();const cookie=loginResponse.headers.get("set-cookie").split(";")[0];
    const enrollmentReauthResponse=await fetch(`${baseUrl}/api/auth/reauthenticate`,{method:"POST",headers:{Origin:allowedOrigin,Cookie:cookie,"X-CSRF-Token":loginBody.csrfToken,"Content-Type":"application/json"},body:JSON.stringify({password:"correct horse battery staple"})});const enrollmentReauth=await enrollmentReauthResponse.json();
    const enrollment = await jsonResponse(await fetch(`${baseUrl}/api/enrollments`, { method: "POST", headers: {Origin:allowedOrigin,Cookie:cookie,"X-CSRF-Token":loginBody.csrfToken,"X-Reauth-Proof":enrollmentReauth.proof,"Content-Type":"application/json"}, body: JSON.stringify({ nodeName: "remote-node", expiresInSeconds: 300 }) })); assert.equal(enrollment.status, 201);
    const enrolled = await services.enrollments.enroll({ enrollmentToken: enrollment.body.token, nodeName: "remote-node", publicKey: pair.publicKey.export({ type: "spki", format: "pem" }).toString(), agentVersion: "0.1.0", protocolVersion: "1.0", platform: "linux", capabilities: ["system.summary.read"] }, crypto.randomUUID());
    const heartbeatAt = new Date().toISOString();
    await services.nodes.heartbeat(enrolled.nodeId, { nodeId: enrolled.nodeId, agentVersion: "0.1.0", protocolVersion: "1.0", timestamp: heartbeatAt, platform: "linux", capabilities: ["system.summary.read"], health: { status: "healthy", uptimeSeconds: 1 }, telemetry: { collectedAt: heartbeatAt, hostname: "remote-node", primaryIp: "10.0.0.2", cpu: { usagePercent: 10, coreUsagePercents: [10] }, memory: { totalBytes: 1024, availableBytes: 512 }, loadAverage: [0.1, 0.2, 0.3], disks: [], uptimeSeconds: 1 } }, crypto.randomUUID());
    const nodes = await jsonResponse(await fetch(`${baseUrl}/api/nodes`, { headers: authHeaders(apiToken) })); assert.equal(nodes.body.nodes[0].nodeName, "remote-node"); assert.doesNotMatch(JSON.stringify(nodes.body), /BEGIN PUBLIC KEY|credentialId|telemetry|10\.0\.0\.2/);
    const reauthResponse=await fetch(`${baseUrl}/api/auth/reauthenticate`,{method:"POST",headers:{Origin:allowedOrigin,Cookie:cookie,"X-CSRF-Token":loginBody.csrfToken,"Content-Type":"application/json"},body:JSON.stringify({password:"correct horse battery staple"})});const reauth=await reauthResponse.json();
    const task = await jsonResponse(await fetch(`${baseUrl}/api/nodes/${enrolled.nodeId}/tasks`, { method: "POST", headers: {Origin:allowedOrigin,Cookie:cookie,"X-CSRF-Token":loginBody.csrfToken,"X-Reauth-Proof":reauth.proof,"Content-Type":"application/json"}, body: JSON.stringify({ type: "system.summary.read", parameters: { includeLoad: false }, expiresInSeconds: 60, idempotencyKey: "http-control-task-1" }) })); assert.equal(task.status, 201);
    const tasks = await jsonResponse(await fetch(`${baseUrl}/api/remote-tasks`, { headers: authHeaders(apiToken) })); assert.equal(tasks.body.tasks.length, 1); assert.equal(Number.isNaN(Date.parse(tasks.body.collectedAt)), false);
    const cancelled = await jsonResponse(await fetch(`${baseUrl}/api/remote-tasks/${task.body.taskId}/cancel`, { method: "POST", headers: authHeaders(apiToken), body: JSON.stringify({ reason: "test" }) })); assert.equal(cancelled.body.status, "cancelled");
    const health = await jsonResponse(await fetch(`${baseUrl}/api/overview/health`, { headers: authHeaders(apiToken) })); assert.equal(health.body.nodes.some((node) => node.id === enrolled.nodeId), true); assert.doesNotMatch(JSON.stringify(health.body), /BEGIN PUBLIC KEY|credentialId|"telemetry"/);
  }, { platform, services });
});

test("overview read models enforce all, partial and empty node scopes without leaking task logs or audits", async () => {
  const { randomUUID } = await import("node:crypto");
  const { MemoryAgentControlRepository } = await import("../../apps/controller/dist/repositories/agentControlRepository.js");
  const { createControllerServices } = await import("../../apps/controller/dist/app.js");
  const { loadControllerConfig } = await import("../../apps/controller/dist/config/environment.js");
  const repository = new MemoryAgentControlRepository();
  const allowedId = "11111111-1111-4111-8111-111111111111";
  const hiddenId = "22222222-2222-4222-8222-222222222222";
  const now = new Date().toISOString();
  const makeNode = (nodeId, marker, cpu) => ({
    nodeId, nodeName: marker, status: "online", agentVersion: "0.2.0", protocolVersion: "1.0", platform: "linux",
    declaredCapabilities: ["system.summary.read"], allowedCapabilities: ["system.summary.read"], enrolledAt: now, lastSeenAt: now, revokedAt: null,
    telemetry: { collectedAt: now, hostname: marker, primaryIp: "10.0.0.2", cpu: { usagePercent: cpu, coreUsagePercents: [cpu] }, memory: { totalBytes: 1024, availableBytes: 256 }, loadAverage: [1, 2, 3], disks: [{ label: "/dev/test", mount: "/", totalBytes: 1024, usedBytes: 900 }], uptimeSeconds: 60 },
  });
  const makeTask = (targetNodeId, marker) => ({
    protocolVersion: "1.0", taskId: randomUUID(), type: "system.summary.read", targetNodeId, parameters: {}, createdAt: now,
    expiresAt: new Date(Date.now() + 60_000).toISOString(), idempotencyKey: `security-${marker}`, requester: marker,
    traceId: randomUUID(), requiredCapability: "system.summary.read", attempt: 1, maxAttempts: 3, status: "succeeded",
    updatedAt: now, result: { message: `${marker}-task-log`, truncated: false }, errorCode: null, retryable: false, nextAttemptAt: null,
  });
  const makeAudit = (nodeId, marker) => ({
    eventId: randomUUID(), timestamp: now, requester: marker, nodeId, taskId: null, event: `${marker}-audit`, taskType: null,
    parameters: null, fromStatus: null, toStatus: "online", resultSummary: null, traceId: randomUUID(),
  });
  await repository.update((state) => {
    state.nodes.push(makeNode(allowedId, "allowed-agent", 90), makeNode(hiddenId, "hidden-agent", 99));
    state.tasks.push(makeTask(allowedId, "allowed-agent"), makeTask(hiddenId, "hidden-agent"));
    state.audits.push(makeAudit(allowedId, "allowed-agent"), makeAudit(hiddenId, "hidden-agent"), makeAudit(null, "global-enrollment"));
  });
  const platform = new FakePlatformAdapter();
  const services = createControllerServices(platform, process.cwd(), loadControllerConfig({}), repository);

  await withServer({}, async (baseUrl, { identity }) => {
    const admin = (await identity.login("admin", "correct horse battery staple", "scope-test", "node-test")).principal;
    const token = (name, permissions, nodeScope) => identity.createApiToken(admin, { name, permissions, nodeScope, expiresAt: null }).token;
    const all = token("all-overview", ["overview:read", "tasks:read", "audit:read"], "all");
    const partial = token("partial-overview", ["overview:read", "tasks:read", "audit:read"], [allowedId]);
    const empty = token("empty-overview", ["overview:read", "tasks:read", "audit:read"], []);
    const summaryOnly = token("summary-only", ["overview:read"], [allowedId]);
    const readEndpoints = ["/api/overview", "/api/overview/health", "/api/overview/tasks", "/api/overview/risks"];
    const readAll = async (apiToken) => Promise.all(readEndpoints.map(async (path) => (await jsonResponse(await fetch(`${baseUrl}${path}`, { headers: authHeaders(apiToken) }))).body));

    const allPayloads = await readAll(all);
    assert.match(JSON.stringify(allPayloads), /allowed-agent/);
    assert.match(JSON.stringify(allPayloads), /hidden-agent/);

    const partialPayloads = await readAll(partial);
    const partialText = JSON.stringify(partialPayloads);
    assert.match(partialText, /allowed-agent/);
    assert.match(partialText, /allowed-agent-task-log|allowed-agent-audit/);
    assert.doesNotMatch(partialText, /hidden-agent|global-enrollment/);

    const emptyText = JSON.stringify(await readAll(empty));
    assert.doesNotMatch(emptyText, /allowed-agent|hidden-agent|global-enrollment/);

    const partialTasks = await jsonResponse(await fetch(`${baseUrl}/api/remote-tasks`, { headers: authHeaders(partial) }));
    assert.equal(partialTasks.status, 200);
    assert.match(JSON.stringify(partialTasks.body), /allowed-agent-task-log/);
    assert.doesNotMatch(JSON.stringify(partialTasks.body), /hidden-agent-task-log/);
    const emptyTasks = await jsonResponse(await fetch(`${baseUrl}/api/remote-tasks`, { headers: authHeaders(empty) }));
    assert.equal(emptyTasks.status, 200);
    assert.deepEqual(emptyTasks.body.tasks, []);
    const forbiddenTasks = await jsonResponse(await fetch(`${baseUrl}/api/remote-tasks`, { headers: authHeaders(summaryOnly) }));
    assert.equal(forbiddenTasks.status, 403);
    assert.equal(forbiddenTasks.body.code, "FORBIDDEN");

    const restrictedPayloads = await readAll(summaryOnly);
    const restrictedText = JSON.stringify(restrictedPayloads);
    assert.match(restrictedText, /allowed-agent/);
    assert.doesNotMatch(restrictedText, /allowed-agent-task-log|allowed-agent-audit|hidden-agent|global-enrollment/);
    assert.doesNotMatch(restrictedText, /credentialId|publicKey|"telemetry"/);

    for (const path of ["/api/overview/refresh", "/api/overview/check-updates", "/api/overview/health/refresh", "/api/overview/tasks", "/api/overview/risks/scan"]) {
      const response = await jsonResponse(await fetch(`${baseUrl}${path}`, { method: "POST", headers: authHeaders(summaryOnly), body: "{}" }));
      assert.equal(response.status, 403, path);
    }
  }, { platform, services });
});

test("writes fail closed without an authenticated identity", async () => {
  await withServer({}, async (baseUrl) => { const response=await jsonResponse(await fetch(`${baseUrl}/api/overview/not-a-route`,{method:"POST"}));assert.equal(response.status,401);assert.equal(response.body.code,"UNAUTHORIZED"); });
});

test("CORS permits exact allowlisted origins and rejects other origins", async () => {
  await withServer({ STACKPILOT_ALLOWED_ORIGINS: allowedOrigin }, async (baseUrl) => {
    const allowed = await fetch(`${baseUrl}/healthz`, { headers: { Origin: allowedOrigin } });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("access-control-allow-origin"), allowedOrigin);
    assert.equal(allowed.headers.get("vary"), "Origin");

    const denied = await jsonResponse(await fetch(`${baseUrl}/healthz`, { headers: { Origin: "https://attacker.example" } }));
    assert.equal(denied.status, 403);
    assert.equal(denied.body.code, "FORBIDDEN");
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
  });
});

test("CORS preflight advertises Authorization only for allowlisted origins", async () => {
  await withServer({ STACKPILOT_ALLOWED_ORIGINS: allowedOrigin }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/overview`, {
      method: "OPTIONS",
      headers: { Origin: allowedOrigin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), allowedOrigin);
    assert.match(response.headers.get("access-control-allow-headers"), /Authorization/);
  });
});

test("all crontab mutations and immediate execution stay disabled by default", async () => {
  await withServer({}, async (baseUrl, { platform, apiToken }) => {
    const list = await jsonResponse(await fetch(`${baseUrl}/api/overview/current-user-crontab`, { headers: authHeaders(apiToken) }));
    assert.equal(list.headers.get("cache-control"), "no-store");
    assert.equal(list.status, 200);
    assert.equal(list.body.writeEnabled, false);
    const cases = [
      { method: "POST", path: "", body: { name: "blocked", cron: "0 4 * * *", command: "true", idempotencyKey: "blocked-create-1" } },
      { method: "PATCH", path: "/example", body: { enabled: false } },
      { method: "DELETE", path: "/example" },
      { method: "PATCH", path: "/example", body: { action: "run", idempotencyKey: "blocked-run-1" } },
    ];
    for (const item of cases) {
      const response = await jsonResponse(await fetch(`${baseUrl}/api/overview/current-user-crontab${item.path}`, {
        method: item.method, headers: authHeaders(apiToken), body: item.body ? JSON.stringify(item.body) : undefined,
      }));
      assert.equal(response.status, 403);
      assert.equal(response.body.code, "FORBIDDEN");
    }
    assert.equal(platform.calls.readCrontab, 1);
    assert.equal(platform.calls.writeCrontab, 0);
    assert.equal(platform.calls.runScheduledCommand, 0);
  });
});

test("enabled schedule mutations require a user session and one-time reauthentication", async () => {
  await withServer({ STACKPILOT_ENABLE_CRONTAB_WRITE: "1", STACKPILOT_ALLOWED_ORIGINS: allowedOrigin }, async (baseUrl, { platform, apiToken }) => {
    const input = { name: "safe-disabled", cron: "0 4 * * *", command: "true", enabled: false, idempotencyKey: "create-safe-disabled-1" };
    assert.equal((await fetch(`${baseUrl}/api/overview/current-user-crontab`, { method: "POST", headers: authHeaders(apiToken), body: JSON.stringify(input) })).status, 403);

    const session = await authenticatedSession(baseUrl);
    assert.equal((await fetch(`${baseUrl}/api/overview/current-user-crontab`, { method: "POST", headers: session.headers(), body: JSON.stringify(input) })).status, 403);
    const proof = await session.reauthenticate();
    const created = await jsonResponse(await fetch(`${baseUrl}/api/overview/current-user-crontab`, { method: "POST", headers: session.headers(proof), body: JSON.stringify(input) }));
    assert.equal(created.status, 201);
    assert.equal(created.body.job.enabled, false);
    assert.equal((await fetch(`${baseUrl}/api/overview/current-user-crontab/${created.body.job.id}`, { method: "PATCH", headers: session.headers(proof), body: JSON.stringify({ enabled: true }) })).status, 403);
    const retryProof = await session.reauthenticate();
    const retried = await jsonResponse(await fetch(`${baseUrl}/api/overview/current-user-crontab`, { method: "POST", headers: session.headers(retryProof), body: JSON.stringify(input) }));
    assert.equal(retried.status, 201);
    assert.equal(retried.body.job.id, created.body.job.id);
    assert.equal(platform.calls.writeCrontab, 1);
    assert.equal(platform.calls.runScheduledCommand, 0);
  });
});

test("oversized and invalid JSON bodies return safe 413 and 400 errors", async () => {
  await withServer({ STACKPILOT_JSON_BODY_LIMIT_BYTES: "48" }, async (baseUrl, { apiToken }) => {
    const marker = "must-not-appear-in-the-response";
    const oversized = await jsonResponse(await fetch(`${baseUrl}/api/overview/risks`, { method: "POST", headers: authHeaders(apiToken), body: JSON.stringify({ value: marker.repeat(4) }) }));
    assert.equal(oversized.status, 413);
    assert.equal(oversized.body.code, "PAYLOAD_TOO_LARGE");
    assert.doesNotMatch(JSON.stringify(oversized.body), new RegExp(marker));

    const invalid = await jsonResponse(await fetch(`${baseUrl}/api/overview/risks`, { method: "POST", headers: authHeaders(apiToken), body: "{" }));
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, "BAD_REQUEST");
  });
});

test("runtime schemas reject illegal fields, query parameters and path ids", async () => {
  await withServer({ STACKPILOT_ENABLE_CRONTAB_WRITE: "1", STACKPILOT_ALLOWED_ORIGINS: allowedOrigin }, async (baseUrl, { platform, apiToken }) => {
    const session = await authenticatedSession(baseUrl);
    const proof = await session.reauthenticate();
    const illegalBody = await jsonResponse(await fetch(`${baseUrl}/api/overview/current-user-crontab`, {
      method: "POST", headers: session.headers(proof), body: JSON.stringify({ name: "job", cron: "0 4 * * *", command: "true", idempotencyKey: "illegal-body-1", unexpected: true }),
    }));
    assert.equal(illegalBody.status, 400);
    assert.equal(illegalBody.body.code, "BAD_REQUEST");

    const query = await jsonResponse(await fetch(`${baseUrl}/api/overview?secret=value`, { headers: authHeaders(apiToken) }));
    assert.equal(query.status, 400);
    const path = await jsonResponse(await fetch(`${baseUrl}/api/overview/tasks/${encodeURIComponent("../bad")}`, { method: "PATCH", headers: authHeaders(apiToken), body: JSON.stringify({ action: "run" }) }));
    assert.equal(path.status, 400);
    const invalidEncoding = await jsonResponse(await fetch(`${baseUrl}/api/overview/tasks/%E0%A4%A`, { method: "PATCH", headers: authHeaders(apiToken), body: JSON.stringify({ action: "run" }) }));
    assert.equal(invalidEncoding.status, 400);
    assert.equal(platform.calls.writeCrontab, 0);
  });
});

test("unknown routes and internal failures use consistent safe errors and request IDs", async () => {
  const platform = new FakePlatformAdapter();
  platform.failSnapshot = true;
  const logger = createMemoryLogger();
  await withServer({}, async (baseUrl, { apiToken }) => {
    const missing = await jsonResponse(await fetch(`${baseUrl}/missing`, { headers: authHeaders(apiToken) }));
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, "NOT_FOUND");
    assert.equal(missing.body.requestId, missing.headers.get("x-request-id"));
    const missingSchedule = await jsonResponse(await fetch(`${baseUrl}/api/overview/current-user-crontab/missing`, { headers: authHeaders(apiToken) }));
    assert.equal(missingSchedule.status, 404);
    assert.equal(missingSchedule.body.code, "NOT_FOUND");

    const failed = await jsonResponse(await fetch(`${baseUrl}/api/overview`, { headers: authHeaders(apiToken) }));
    assert.equal(failed.status, 500);
    assert.deepEqual(Object.keys(failed.body).sort(), ["code", "error", "requestId"]);
    assert.equal(failed.body.error, "服务内部错误");
    assert.doesNotMatch(JSON.stringify(failed.body), /private|system|stack|token/i);
  }, { platform, logger });
  assert.ok(logger.records.some((record) => record.message === "未预期的 Controller 错误"));
  assert.ok(logger.records.some((record) => record.method === "GET" && record.path === "/api/overview" && record.status === 500 && typeof record.durationMs === "number"));
});

test("structured logger redacts sensitive fields", () => {
  const logger = createMemoryLogger();
  logger.log({ level: "info", time: new Date().toISOString(), message: "test", authorization: `Bearer ${validToken}`, cookie: "session=secret", token: validToken, stdout: "command secret", request: { headers: { authorization: validToken } } });
  assert.deepEqual({ authorization: logger.records[0].authorization, cookie: logger.records[0].cookie, token: logger.records[0].token, stdout: logger.records[0].stdout }, { authorization: "[REDACTED]", cookie: "[REDACTED]", token: "[REDACTED]", stdout: "[REDACTED]" });
  assert.equal(logger.records[0].request.headers.authorization, "[REDACTED]");
});

test("wildcard CORS and invalid environment configuration are rejected at startup", () => {
  assert.throws(() => createStackPilotServer({ env: { STACKPILOT_ALLOWED_ORIGINS: "*" } }), /不允许使用通配符/);
  assert.throws(() => createStackPilotServer({ env: { PORT: "70000" } }));
});
