import { expect, test, type Locator, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/#files");
  await page.getByRole("textbox", { name: "用户名" }).fill("e2e-admin");
  await page.getByRole("textbox", { name: "密码" }).fill("e2e administrator password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "文件", level: 1 })).toBeVisible();
}

async function animation(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { name: style.animationName, duration: style.animationDuration };
  });
}

test("internal controls animate without replaying on silent polling", async ({ page }, testInfo) => {
  await login(page);

  const typeSelect = page.getByRole("combobox", { name: /类型/ });
  await typeSelect.click();
  const listbox = page.getByRole("listbox", { name: "类型" });
  await expect(listbox).toBeVisible();
  expect((await animation(listbox)).name).toContain("internal-popover-enter");
  await page.keyboard.press("Escape");
  await expect(listbox).toHaveCount(0);

  await page.getByRole("button", { name: "创建文件夹" }).click();
  const drawer = page.getByRole("dialog", { name: "创建文件夹" });
  await expect(drawer).toBeVisible();
  expect((await animation(drawer)).name).toContain("internal-drawer-enter");
  const scrim = page.locator(".drawer-scrim");
  expect((await animation(scrim)).name).toContain("internal-scrim-enter");
  await drawer.getByRole("button", { name: "关闭详情" }).click();
  await expect(drawer).toHaveAttribute("data-closing", "true");
  expect((await animation(drawer)).name).toContain("internal-drawer-exit");
  await expect(drawer).toHaveCount(0);

  const table = page.locator(".module-table-wrap");
  await expect(table).toHaveAttribute("data-motion-revision", "0");
  const readsBeforePoll = await page.evaluate(() => performance.getEntriesByType("resource").filter((entry) => entry.name.includes("/api/files")).length);
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType("resource").filter((entry) => entry.name.includes("/api/files")).length), { timeout: 15_000 }).toBeGreaterThan(readsBeforePoll);
  await expect(table).toHaveAttribute("data-motion-revision", "0");

  const mobile = testInfo.project.name.startsWith("mobile");
  const sortButton = page.getByRole("button", { name: mobile ? /大小，未排序，点击切换卡片排序/ : /大小，未排序，点击切换排序/ });
  await sortButton.click();
  await expect(table).toHaveAttribute("data-motion-revision", "1");
  const results = page.locator(mobile ? ".module-card-list" : ".module-table-results");
  await expect(results).toHaveClass(/is-interaction-entering/);
  expect((await animation(results)).name).toContain("internal-results-enter");
  await page.screenshot({ path: testInfo.outputPath("internal-motion.png"), fullPage: true });
});

test("reduced motion disables internal animations and closes overlays immediately", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);
  await page.getByRole("button", { name: "创建文件夹" }).click();
  const drawer = page.getByRole("dialog", { name: "创建文件夹" });
  await expect(drawer).toBeVisible();
  expect((await animation(drawer)).name).toBe("none");
  await drawer.getByRole("button", { name: "关闭详情" }).click();
  await expect(drawer).toHaveCount(0);
});
