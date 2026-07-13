import { expect, test, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const password = "e2e administrator password";
const agentPort = Number(process.env.STACKPILOT_E2E_AGENT_PORT ?? 19443);
const runtime = process.env.STACKPILOT_E2E_RUNTIME ?? "runtime";
let agent: ChildProcess | undefined;

async function api<T>(page: Page, path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return page.evaluate(async ({ path, method, body, headers }) => {
    const session = await fetch("/api/auth/session", { credentials: "include" }).then((response) => response.json());
    const response = await fetch(path, { method, credentials: "include", headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(session.csrfToken ? { "X-CSRF-Token": session.csrfToken } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() };
  }, { path, method, body, headers }) as Promise<{ status: number; body: T }>;
}

test.afterEach(async () => {
  if (agent?.exitCode === null) agent.kill("SIGTERM");
  if (agent?.exitCode === null) await Promise.race([once(agent, "exit"), new Promise((resolveWait) => setTimeout(resolveWait, 5_000))]);
  agent = undefined;
});

test("terminal history renders persisted Agent tasks and polls silently", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "用户名" }).fill("e2e-admin");
  await page.getByRole("textbox", { name: "密码" }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("region", { name: "实时工作台状态" })).toBeVisible();
  const proof = (await api<{ proof: string }>(page, "/api/auth/reauthenticate", "POST", { password })).body.proof;
  const nodeName = `history-node-${testInfo.project.name}`;
  const enrollment = await api<{ token: string }>(page, "/api/enrollments", "POST", { nodeName, expiresInSeconds: 300 }, { "X-Reauth-Proof": proof });
  expect(enrollment.status).toBe(201);
  const state = resolve("output", "e2e", runtime, `history-agent-${testInfo.project.name}`);
  rmSync(state, { recursive: true, force: true }); mkdirSync(state, { recursive: true });
  agent = spawn(process.execPath, ["apps/agent/dist/main.js"], { cwd: process.cwd(), env: { ...process.env, STACKPILOT_CONTROLLER_URL: `https://127.0.0.1:${agentPort}`, STACKPILOT_AGENT_CA_PATH: resolve("output", "e2e", runtime, "controller-ca.crt"), STACKPILOT_AGENT_STATE_DIR: state, STACKPILOT_AGENT_NAME: nodeName, STACKPILOT_AGENT_ENROLLMENT_TOKEN: enrollment.body.token, STACKPILOT_AGENT_HEARTBEAT_SECONDS: "5" }, stdio: ["ignore", "pipe", "pipe"] });
  let agentOutput = "";
  agent.stdout?.on("data", (chunk) => { agentOutput += chunk.toString(); });
  agent.stderr?.on("data", (chunk) => { agentOutput += chunk.toString(); });
  let nodeId = "";
  await expect.poll(async () => {
    if (agent?.exitCode !== null) throw new Error(`Agent 提前退出：${agentOutput || `exit ${agent?.exitCode}`}`);
    const nodes = await api<{ nodes: Array<{ nodeId: string; nodeName: string; status: string }> }>(page, "/api/nodes");
    const node = nodes.body.nodes.find((candidate) => candidate.nodeName === nodeName); nodeId = node?.nodeId ?? ""; return node?.status;
  }, { timeout: 25_000 }).toBe("online");
  const taskProof = (await api<{ proof: string }>(page, "/api/auth/reauthenticate", "POST", { password })).body.proof;
  const created = await api<{ taskId: string }>(page, `/api/nodes/${nodeId}/tasks`, "POST", { type: "system.summary.read", parameters: { includeLoad: false }, expiresInSeconds: 30, idempotencyKey: `history-${testInfo.project.name}` }, { "X-Reauth-Proof": taskProof });
  await expect.poll(async () => (await api<{ tasks: Array<{ taskId: string; status: string }> }>(page, "/api/remote-tasks")).body.tasks.find((task) => task.taskId === created.body.taskId)?.status, { timeout: 25_000 }).toBe("succeeded");

  let polls = 0;
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/remote-tasks") polls += 1; });
  await page.goto("/#terminal-history");
  await expect(page.getByText("读取系统摘要").first()).toBeVisible();
  await expect(page.getByText(nodeName).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /打开会话|重跑|固定/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await page.getByRole("button", { name: /查看任务详情 读取系统摘要/ }).first().click();
  await expect(page.getByRole("dialog", { name: "读取系统摘要" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("terminal-history.png"), fullPage: true });
  await page.getByRole("button", { name: "关闭详情" }).last().click();
  await expect.poll(() => polls, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
});
