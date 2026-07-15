import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "用户名" }).fill("e2e-admin");
  await page.getByRole("textbox", { name: "密码" }).fill("e2e administrator password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("region", { name: "实时工作台状态" })).toBeVisible();
}

test("audit page renders real Controller data and completes silent polling", async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  let auditRequests = 0;
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}`));
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/audit") auditRequests += 1; });

  await login(page);
  await page.goto("/#audit");
  await expect.poll(() => auditRequests).toBeGreaterThanOrEqual(1);
  await expect(page.getByText("auth.login").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(/后端采集于/)).toBeVisible();
  await expect.poll(() => auditRequests, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);

  await page.getByRole("button", { name: "详情" }).filter({ visible: true }).first().click();
  const details = page.getByRole("dialog", { name: "审计详情" });
  await expect(details).toBeVisible();
  await expect(details.getByText("Request ID")).toBeVisible();
  await expect(details.getByText("事件哈希")).toBeVisible();
  await details.getByRole("button", { name: "关闭审计详情" }).click();

  await page.getByRole("button", { name: "导出全部匹配" }).click();
  const exportDialog = page.getByRole("dialog", { name: "导出真实审计" });
  const download = page.waitForEvent("download");
  await exportDialog.getByRole("button", { name: "导出 JSON" }).click();
  expect((await download).suggestedFilename()).toMatch(/^stackpilot-audit-\d{4}-\d{2}-\d{2}\.json$/);

  const viewport = await page.evaluate(() => ({ inner: window.innerWidth, body: document.body.scrollWidth, root: document.documentElement.scrollWidth }));
  expect(viewport.body).toBeLessThanOrEqual(viewport.inner);
  expect(viewport.root).toBeLessThanOrEqual(viewport.inner);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("audit-real-backend.png"), fullPage: true });
});
