import { defineConfig, devices } from "@playwright/test";

const appUrl = "http://127.0.0.1:5187";

export default defineConfig({
  testDir: "./tests/browser",
  outputDir: "./test-results/playwright",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  reporter: "line",
  use: {
    baseURL: appUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"],
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: appUrl,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
