import { expect, test } from "@playwright/test";

const adminPassword = "e2e administrator password";

test("audit page renders real backend events and polls without layout overflow", async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  let auditRequests = 0;
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/audit") auditRequests += 1; });

  await page.goto("/#audit-all");
  await page.getByRole("textbox", { name: "用户名" }).fill("e2e-admin");
  await page.getByRole("textbox", { name: "密码" }).fill(adminPassword);
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page).toHaveURL(/#audit-all$/);
  await expect(page.getByText("auth.login").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(/后端采集于/)).toBeVisible();
  await expect(page.getByText(/匹配 \d+/)).toBeVisible();
  await expect(page.getByText("部署应用")).toHaveCount(0);

  const detailButtons = page.getByRole("button", { name: "详情" }).filter({ visible: true });
  await detailButtons.first().click();
  const drawer = page.getByText("审计详情", { exact: true }).locator("xpath=ancestor::aside");
  await expect(drawer).toContainText("Request ID");
  await expect(drawer).toContainText("事件哈希");
  await drawer.getByRole("button", { name: "关闭审计详情" }).click();

  await expect.poll(() => auditRequests, { timeout: 13_000 }).toBeGreaterThanOrEqual(2);
  const viewport = await page.evaluate(() => ({
    inner: window.innerWidth,
    body: document.body.scrollWidth,
    root: document.documentElement.scrollWidth,
  }));
  expect(viewport.body).toBeLessThanOrEqual(viewport.inner);
  expect(viewport.root).toBeLessThanOrEqual(viewport.inner);
  expect(consoleErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("audit-real-backend.png"), fullPage: true });
});
