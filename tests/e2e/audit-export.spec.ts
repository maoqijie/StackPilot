import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const adminPassword = "e2e administrator password";

async function login(page: Page, username: string, password = adminPassword) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "用户名" }).fill(username);
  await page.getByRole("textbox", { name: "密码" }).fill(password);
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
  const format = testInfo.project.name.startsWith("mobile") ? "json" : "csv";
  const snapshotName = `E2E ${format.toUpperCase()} ${testInfo.project.name}`;
  await login(page, username);
  await page.goto("/#audit-export");
  await expect(page.getByText(/后端采集/)).toBeVisible();
  await expect(page.getByText("今日操作审计 CSV")).toHaveCount(0);

  await page.getByRole("button", { name: "新建导出" }).click();
  const create = page.getByRole("alertdialog", { name: "创建审计快照" });
  await create.getByLabel("导出名称").fill(snapshotName);
  if (format === "json") {
    await create.getByRole("combobox", { name: /文件格式/ }).click();
    await create.getByRole("option", { name: "JSON" }).click();
  }
  await create.getByLabel("当前密码").fill(adminPassword);
  await create.getByRole("button", { name: "确认生成" }).click();
  await expect(page.getByText("真实审计快照已生成")).toBeVisible();
  const row = page.locator(".module-card-row:visible, .module-table tbody tr:visible").filter({ hasText: snapshotName }).first();
  await expect(row).toBeVisible();
  await expect(row.locator(".pill").filter({ hasText: "可下载" })).toBeVisible();
  await row.getByRole("button", { name: "详情" }).click();
  const details = page.getByRole("dialog", { name: "导出详情" });
  const expectedSha = (await details.locator(".audit-export-digest").textContent())?.trim();
  expect(expectedSha).toMatch(/^[0-9a-f]{64}$/);
  await details.getByRole("button", { name: "关闭导出详情" }).click();

  await row.getByRole("button", { name: "下载" }).click();
  const downloadDialog = page.getByRole("alertdialog", { name: "下载审计快照" });
  await downloadDialog.getByLabel("当前密码").fill(adminPassword);
  const downloadPromise = page.waitForEvent("download");
  await downloadDialog.getByRole("button", { name: "确认下载" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));
  const downloadPath = testInfo.outputPath(`audit-export.${format}`);
  await download.saveAs(downloadPath);
  const contents = await readFile(downloadPath);
  expect(createHash("sha256").update(contents).digest("hex")).toBe(expectedSha);
  if (format === "json") expect(JSON.parse(contents.toString("utf8"))).toEqual(expect.objectContaining({ events: expect.any(Array) }));
  else expect(contents.toString("utf8")).toContain("eventId");

  if (testInfo.project.name === "desktop-chromium") {
    const failed = page.locator(".module-card-row:visible, .module-table tbody tr:visible").filter({ hasText: "E2E 失败快照" }).first();
    await failed.getByRole("button", { name: "重试" }).click();
    const retry = page.getByRole("alertdialog", { name: "重新生成审计快照" });
    await retry.getByLabel("当前密码").fill(adminPassword);
    await retry.getByRole("button", { name: "确认重试" }).click();
    await expect(page.getByText("审计快照已重新生成")).toBeVisible();
    await expect(page.locator(".module-card-row:visible, .module-table tbody tr:visible").filter({ hasText: "E2E 失败快照" }).filter({ hasText: "可下载" }).first()).toBeVisible();
  }

  const responsesBeforePollingCycle = listResponses;
  await expect.poll(() => listResponses, { timeout: 15_000 }).toBeGreaterThan(responsesBeforePollingCycle);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  const responsesWhileHidden = listResponses;
  await page.waitForTimeout(10_500);
  expect(listResponses).toBe(responsesWhileHidden);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect.poll(() => listResponses, { timeout: 3_000 }).toBeGreaterThan(responsesWhileHidden);
  const viewport = await page.evaluate(() => ({ inner: window.innerWidth, body: document.body.scrollWidth, root: document.documentElement.scrollWidth }));
  expect(viewport.body).toBeLessThanOrEqual(viewport.inner);
  expect(viewport.root).toBeLessThanOrEqual(viewport.inner);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("audit-export-real.png"), fullPage: true });
});

test("audit reader cannot access persistent exports", async ({ page }) => {
  await login(page, "e2e-reader", "e2e reader password");
  await page.goto("/#audit-export");
  await expect(page.getByText("当前账号没有审计导出权限")).toBeVisible();
  await expect(page.getByRole("button", { name: "新建导出" })).toHaveCount(0);
  expect((await page.request.get("/api/audit-exports")).status()).toBe(404);
});
