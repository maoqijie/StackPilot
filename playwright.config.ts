import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "output/playwright/report", open: "never" }]],
  outputDir: "output/playwright/results",
  use: { baseURL: "https://127.0.0.1:18443", ignoreHTTPSErrors: true, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile-chromium", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  webServer: { command: "node tests/e2e/support/production-server.mjs", url: "https://127.0.0.1:18443/healthz", ignoreHTTPSErrors: true, reuseExistingServer: false, timeout: 60_000 },
});
