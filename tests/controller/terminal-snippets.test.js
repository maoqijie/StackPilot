import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createControllerServices } from "../../apps/controller/dist/app.js";
import { loadControllerConfig } from "../../apps/controller/dist/config/environment.js";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { IdentityService } from "../../apps/controller/dist/identity/identityService.js";
import { MemoryAgentControlRepository } from "../../apps/controller/dist/repositories/agentControlRepository.js";
import { createStackPilotServer } from "../../apps/controller/dist/server.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";

const origin = "http://127.0.0.1:5173";
const password = "correct horse battery staple";
const nodeId = "11111111-1111-4111-8111-111111111111";
const cookie = (response) => response.headers.get("set-cookie")?.split(";")[0] ?? "";

test("terminal snippets persist preferences and only execute catalog-mapped Agent tasks", async () => {
  const database = openDatabase(":memory:");
  const identity = new IdentityService(database, Buffer.alloc(32, 4));
  await identity.createInitialAdministrator("admin", "Administrator", password);
  const administrator = (await identity.login("admin", password, "test", "terminal-test")).principal;
  const terminalReadToken = identity.createApiToken(administrator, { name: "terminal-read", permissions: ["terminal:read"], nodeScope: "all", expiresAt: null }).token;
  const repository = new MemoryAgentControlRepository();
  const now = new Date().toISOString();
  await repository.update((state) => state.nodes.push({ nodeId, nodeName: "terminal-node", status: "online", agentVersion: "0.2.0", protocolVersion: "1.0", platform: "linux", declaredCapabilities: ["system.summary.read"], allowedCapabilities: ["system.summary.read"], enrolledAt: now, lastSeenAt: now, revokedAt: null }));
  const services = createControllerServices(new FakePlatformAdapter(), process.cwd(), loadControllerConfig({}), repository, database);
  const server = createStackPilotServer({ env: { STACKPILOT_COOKIE_SECURE: "0", STACKPILOT_ALLOWED_ORIGINS: origin }, database, identity, services });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/terminal/snippets`)).status, 401);
    const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password }) });
    const loginBody = await login.json(); const session = cookie(login);
    const read = await fetch(`${base}/api/terminal/snippets`, { headers: { Cookie: session } });
    assert.equal(read.status, 200); const catalog = await read.json();
    assert.equal(catalog.snippets.some((snippet) => snippet.id === "system-resource-summary" && snippet.executable), true);
    assert.equal(catalog.snippets.some((snippet) => snippet.id === "clear-temporary-cache" && !snippet.executable), true);
    assert.doesNotMatch(JSON.stringify(catalog), /panel-se-01|10\.0\.0\.11/);
    assert.equal((await fetch(`${base}/api/nodes`, { headers: { Authorization: `Bearer ${terminalReadToken}` } })).status, 403);
    const terminalNodes = await fetch(`${base}/api/terminal/nodes`, { headers: { Authorization: `Bearer ${terminalReadToken}` } });
    assert.equal(terminalNodes.status, 200); assert.deepEqual((await terminalNodes.json()).nodes.map((node) => node.nodeId), [nodeId]);

    const writeHeaders = { Origin: origin, Cookie: session, "X-CSRF-Token": loginBody.csrfToken, "Content-Type": "application/json" };
    assert.equal((await fetch(`${base}/api/terminal/snippets/system-resource-summary/favorite`, { method: "PATCH", headers: { Cookie: session, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ favorite: true }) })).status, 403);
    const favorite = await fetch(`${base}/api/terminal/snippets/system-resource-summary/favorite`, { method: "PATCH", headers: writeHeaders, body: JSON.stringify({ favorite: true }) });
    assert.equal(favorite.status, 200); assert.equal((await favorite.json()).favorite, true);
    assert.equal((await (await fetch(`${base}/api/terminal/snippets`, { headers: { Cookie: session } })).json()).snippets.find((snippet) => snippet.id === "system-resource-summary").favorite, true);

    const request = { nodeId, snippetVersion: 1, idempotencyKey: "terminal-http-test-1" };
    assert.equal((await fetch(`${base}/api/terminal/snippets/system-resource-summary/executions`, { method: "POST", headers: writeHeaders, body: JSON.stringify(request) })).status, 403);
    const reauth = await (await fetch(`${base}/api/auth/reauthenticate`, { method: "POST", headers: writeHeaders, body: JSON.stringify({ password }) })).json();
    const tampered = await fetch(`${base}/api/terminal/snippets/system-resource-summary/executions`, { method: "POST", headers: { ...writeHeaders, "X-Reauth-Proof": reauth.proof }, body: JSON.stringify({ ...request, command: "id" }) });
    assert.equal(tampered.status, 400);
    const execution = await fetch(`${base}/api/terminal/snippets/system-resource-summary/executions`, { method: "POST", headers: { ...writeHeaders, "X-Reauth-Proof": reauth.proof }, body: JSON.stringify(request) });
    assert.equal(execution.status, 201); const body = await execution.json();
    assert.equal(body.task.type, "system.summary.read"); assert.deepEqual(body.task.parameters, { includeLoad: true });
    assert.match(body.task.idempotencyKey, /^terminal:/);
    assert.equal(body.snippet.lastUsedAt !== null, true); assert.doesNotMatch(JSON.stringify(body.task), /df -h|uptime|command/);
    const originalUpdate = repository.update.bind(repository); let updateCalls = 0;
    repository.update = (...args) => { updateCalls += 1; return originalUpdate(...args); };
    const terminalTasks = await fetch(`${base}/api/terminal/tasks`, { headers: { Authorization: `Bearer ${terminalReadToken}` } });
    assert.equal(terminalTasks.status, 200); assert.deepEqual((await terminalTasks.json()).tasks.map((task) => task.taskId), [body.task.taskId]);
    assert.equal(updateCalls, 0);
  } finally { server.close(); await once(server, "close"); database.close(); }
});
