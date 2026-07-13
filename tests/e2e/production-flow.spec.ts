import { expect, test, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const adminPassword = "e2e administrator password";
let agent: ChildProcess | undefined;

async function login(page: Page, username: string, password: string) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "用户名" }).fill(username);
  await page.getByRole("textbox", { name: "密码" }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("region", { name: "实时工作台状态" })).toBeVisible();
}

async function api<T>(page: Page, path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return page.evaluate(async ({ path, method, body, headers }) => {
    const session = await fetch("/api/auth/session", { credentials: "include" }).then((response) => response.json());
    const response = await fetch(path, { method, credentials: "include", headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(session.csrfToken ? { "X-CSRF-Token": session.csrfToken } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() };
  }, { path, method, body, headers }) as Promise<{ status: number; body: T }>;
}

async function reauthenticate(page: Page) {
  const result = await api<{ proof: string }>(page, "/api/auth/reauthenticate", "POST", { password: adminPassword });
  expect(result.status).toBe(200);
  return result.body.proof;
}

async function stopAgent() {
  if (agent && agent.exitCode === null && agent.signalCode === null && !agent.killed) { agent.kill("SIGTERM"); await once(agent, "exit"); }
  agent = undefined;
}
test.afterEach(stopAgent);

test("production HTTPS flow covers identity, Agent lifecycle, task, audit and session revocation", async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}`));
  await login(page, "e2e-admin", adminPassword);
  expect(await page.evaluate(() => location.protocol)).toBe("https:");
  await expect(page.getByText(/Windows 等效/).first()).toBeVisible();

  const proof = await reauthenticate(page);
  const agentName = `e2e-node-${testInfo.project.name}-${testInfo.repeatEachIndex}`;
  const enrollment = await api<{ token: string }>(page, "/api/enrollments", "POST", { nodeName: agentName, expiresInSeconds: 300 }, { "X-Reauth-Proof": proof });
  expect(enrollment.status).toBe(201);
  const state = resolve("output", "e2e", "runtime", `agent-${testInfo.project.name}-${testInfo.repeatEachIndex}`);
  rmSync(state, { recursive: true, force: true });
  mkdirSync(state, { recursive: true });
  const agentPort = Number(process.env.STACKPILOT_E2E_AGENT_PORT ?? 19_443);
  agent = spawn(process.execPath, ["apps/agent/dist/main.js"], { cwd: process.cwd(), env: { ...process.env, STACKPILOT_CONTROLLER_URL: `https://127.0.0.1:${agentPort}`, STACKPILOT_AGENT_CA_PATH: resolve("output", "e2e", "runtime", "controller-ca.crt"), STACKPILOT_AGENT_STATE_DIR: state, STACKPILOT_AGENT_NAME: agentName, STACKPILOT_AGENT_ENROLLMENT_TOKEN: enrollment.body.token, STACKPILOT_AGENT_HEARTBEAT_SECONDS: "5" }, stdio: "ignore" });

  let nodeId = "";
  await expect.poll(async () => { const result = await api<{ nodes: Array<{ nodeId: string; status: string }> }>(page, "/api/nodes"); const node = result.body.nodes.find((item) => item.status === "online"); nodeId = node?.nodeId ?? ""; return node?.status; }, { timeout: 25_000 }).toBe("online");
  const taskProof = await reauthenticate(page);
  const task = await api<{ taskId: string }>(page, `/api/nodes/${nodeId}/tasks`, "POST", { type: "system.summary.read", parameters: { includeLoad: false }, expiresInSeconds: 30, idempotencyKey: `e2e-summary-${testInfo.project.name}` }, { "X-Reauth-Proof": taskProof });
  expect(task.status).toBe(201);
  await expect.poll(async () => { const result = await api<{ tasks: Array<{ taskId: string; status: string }> }>(page, "/api/remote-tasks"); return result.body.tasks.find((item) => item.taskId === task.body.taskId)?.status; }, { timeout: 25_000 }).toBe("succeeded");

  await stopAgent();
  const expireProof = await reauthenticate(page);
  const expiring = await api<{ taskId: string }>(page, `/api/nodes/${nodeId}/tasks`, "POST", { type: "system.summary.read", parameters: { includeLoad: false }, expiresInSeconds: 5, idempotencyKey: `e2e-expire-${testInfo.project.name}` }, { "X-Reauth-Proof": expireProof });
  await expect.poll(async () => { const result = await api<{ tasks: Array<{ taskId: string; status: string }> }>(page, "/api/remote-tasks"); return result.body.tasks.find((item) => item.taskId === expiring.body.taskId)?.status; }, { timeout: 15_000 }).toBe("expired");

  const revokeProof = await reauthenticate(page);
  expect((await api(page, `/api/nodes/${nodeId}`, "DELETE", {}, { "X-Reauth-Proof": revokeProof })).status).toBe(200);
  const audit = await api<{ events: Array<{ action: string }> }>(page, "/api/audit");
  expect(audit.status).toBe(200);
  expect(audit.body.events.some((item) => item.action.includes("task"))).toBeTruthy();
  expect((await api(page, "/api/auth/logout", "POST", {})).status).toBe(200);
  expect((await page.request.get("/api/users")).status()).toBe(401);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test("read-only user is denied direct state-changing API calls", async ({ page }) => {
  await login(page, "e2e-reader", "e2e reader password");
  expect((await api(page, "/api/overview/tasks", "POST", {})).status).toBe(403);
});
