import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "用户名" }).fill("e2e-reader");
  await page.getByRole("textbox", { name: "密码" }).fill("e2e reader password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("region", { name: "实时工作台状态" })).toBeVisible();
}

async function assertNoHorizontalOverflow(page: Page) {
  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    body: document.body.scrollWidth,
    root: document.documentElement.scrollWidth,
  }));
  expect(viewport.body).toBeLessThanOrEqual(viewport.width);
  expect(viewport.root).toBeLessThanOrEqual(viewport.width);
}

async function showSidebarChild(page: Page, name: string) {
  const child = page.getByRole("button", { name: new RegExp(`^${name}`) });
  if (await child.isVisible()) return;
  const expandSidebar = page.getByRole("button", { name: "展开侧栏" });
  if (await expandSidebar.isVisible()) {
    await expandSidebar.click();
    await expect(page.getByRole("button", { name: "收起侧栏" })).toBeVisible();
  }
  const parent = page.getByRole("button", { name: "工作台", exact: true });
  if (await parent.getAttribute("aria-expanded") !== "true") await parent.click();
  await expect(child).toBeVisible();
}

test("page navigation transitions without moving the persistent shell", async ({ page }, testInfo) => {
  await login(page);
  await page.evaluate(() => {
    const documentWithTransitions = document as Document & { __transitionCount?: number; __lastTransition?: Promise<void> };
    const startViewTransition = document.startViewTransition.bind(document);
    documentWithTransitions.__transitionCount = 0;
    document.startViewTransition = (update) => {
      documentWithTransitions.__transitionCount = (documentWithTransitions.__transitionCount ?? 0) + 1;
      const transition = startViewTransition(update);
      documentWithTransitions.__lastTransition = transition.finished;
      return transition;
    };
  });

  const content = page.locator(".desktop-content");
  await content.evaluate((element) => { element.scrollTop = 240; });
  const shellBefore = await page.locator(".cloud-header").boundingBox();

  await showSidebarChild(page, "集群状态");
  await page.getByRole("button", { name: /^集群状态/ }).click();
  await expect(page).toHaveURL(/#overview-health$/);
  await expect(page.getByRole("heading", { name: "集群状态" })).toBeVisible();
  await page.evaluate(() => (document as Document & { __lastTransition?: Promise<void> }).__lastTransition);

  expect(await content.evaluate((element) => element.scrollTop)).toBe(0);
  expect(await page.evaluate(() => (document as Document & { __transitionCount?: number }).__transitionCount)).toBe(1);
  expect(await page.locator(".desktop-page-transition").evaluate((element) => getComputedStyle(element).viewTransitionName)).toBe("page-content");
  expect(await page.locator(".cloud-header").boundingBox()).toEqual(shellBefore);
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("page-transition.png"), fullPage: true });
});

test("reduced motion skips the native page transition", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);
  await page.evaluate(() => {
    const documentWithTransitions = document as Document & { __transitionCount?: number };
    const startViewTransition = document.startViewTransition.bind(document);
    documentWithTransitions.__transitionCount = 0;
    document.startViewTransition = (update) => {
      documentWithTransitions.__transitionCount = (documentWithTransitions.__transitionCount ?? 0) + 1;
      return startViewTransition(update);
    };
  });

  await showSidebarChild(page, "任务流");
  await page.getByRole("button", { name: /^任务流/ }).click();
  await expect(page).toHaveURL(/#overview-tasks$/);

  expect(await page.evaluate(() => (document as Document & { __transitionCount?: number }).__transitionCount)).toBe(0);
  await assertNoHorizontalOverflow(page);
});
