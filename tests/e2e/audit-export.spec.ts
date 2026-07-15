import { expect, test, type Page } from "@playwright/test";

const adminPassword = "e2e administrator password";

async function login(page: Page, username: string) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "用户名" }).fill(username);
  await page.getByRole("textbox", { name: "密码" }).fill(adminPassword);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("region", { name: "实时工作台状态" })).toBeVisible();
}

test("audit export uses the real backend across desktop and mobile", async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  let listResponses = 0;
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}`));
  page.on("response", (response) => { if (new URL(response.url()).pathname === "/api/audit-exports" && response.request().method() === "GET" && response.status() === 200) listResponses += 1; });
  const username = testInfo.project.name.startsWith("mobile") ? "e2e-admin-mobile" : "e2e-admin";
  await login(page, username);
  await page.goto("/#audit-export");
  await expect(page.getByText(/后端采集/)).toBeVisible();
  await expect(page.getByText("今日操作审计 CSV")).toHaveCount(0);

  await page.getByRole("button", { name: "新建导出" }).click();
  const create = page.getByRole("alertdialog", { name: "创建审计快照" });
  await create.getByLabel("当前密码").fill(adminPassword);
  await create.getByRole("button", { name: "确认生成" }).click();
  await expect(page.getByText("真实审计快照已生成")).toBeVisible();
  await expect(page.locator(".module-card-title:visible").filter({ hasText: "审计快照" }).or(page.locator(".module-table tbody tr:visible").filter({ hasText: "审计快照" })).first()).toBeVisible();
  await expect(page.locator(".pill:visible").filter({ hasText: "可下载" }).first()).toBeVisible();

  const downloadButton = page.locator("button:visible").filter({ hasText: /^下载$/ }).first();
  await downloadButton.click();
  const downloadDialog = page.getByRole("alertdialog", { name: "下载审计快照" });
  await downloadDialog.getByLabel("当前密码").fill(adminPassword);
  const downloadPromise = page.waitForEvent("download");
  await downloadDialog.getByRole("button", { name: "确认下载" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);

  const responsesBeforePollingCycle = listResponses;
  await expect.poll(() => listResponses, { timeout: 15_000 }).toBeGreaterThan(responsesBeforePollingCycle);
  const viewport = await page.evaluate(() => ({ inner: window.innerWidth, body: document.body.scrollWidth, root: document.documentElement.scrollWidth }));
  expect(viewport.body).toBeLessThanOrEqual(viewport.inner);
  expect(viewport.root).toBeLessThanOrEqual(viewport.inner);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("audit-export-real.png"), fullPage: true });
});
