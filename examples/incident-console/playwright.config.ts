import { defineConfig, devices } from "@playwright/test";

const webPort = process.env.INCIDENT_WEB_PORT ?? "5187";
const appUrl = `http://127.0.0.1:${webPort}`;

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
    command: "nub run dev",
    url: appUrl,
    reuseExistingServer: process.env.ACCEPTANCE !== "1",
    timeout: 120_000,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      INCIDENT_API_PORT: process.env.INCIDENT_API_PORT ?? "5190",
      INCIDENT_WEB_PORT: webPort,
      INCIDENT_WEB_ORIGIN: process.env.INCIDENT_WEB_ORIGIN ?? `http://127.0.0.1:${webPort}`,
      NEXT_PUBLIC_INCIDENT_API_URL:
        process.env.NEXT_PUBLIC_INCIDENT_API_URL ?? "http://127.0.0.1:5190",
      ACCEPTANCE: process.env.ACCEPTANCE ?? "0",
    },
  },
});
