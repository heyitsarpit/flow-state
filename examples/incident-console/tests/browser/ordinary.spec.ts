import { expect, test } from "@playwright/test";

const apiUrl = process.env.INCIDENT_API_URL ?? "http://127.0.0.1:5190";

test.beforeEach(async ({ request }) => {
  const response = await request.post(`${apiUrl}/__dev/reset`, { data: { seed: "normal" } });
  expect(response.ok()).toBe(true);
});

test("triages the queue, updates an incident, follows timeline, and controls a runbook", async ({
  page,
}) => {
  let detailRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "GET" && request.url().endsWith("/api/incidents/INC-002")) {
      detailRequests += 1;
    }
  });
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Incident Console" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Elevated API latency/ })).toBeVisible();
  await expect(page.getByTestId("api-status")).toContainText("connected");

  await page.getByLabel("Service filter").selectOption("api");
  await page.getByLabel("Severity filter").selectOption("critical");
  await page.getByLabel("Status filter").selectOption("open");
  await page.getByLabel("Assignee filter").selectOption("unassigned");
  await expect(page.getByText("No incidents match these filters.")).toBeVisible();
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByRole("button", { name: /Elevated API latency/ })).toBeVisible();

  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByRole("button", { name: /Duplicate invoice notifications/ })).toBeVisible();
  await page.getByRole("button", { name: "First page" }).click();
  await page.getByRole("button", { name: /Payment retries exhausted/ }).click();

  await expect(page.getByRole("heading", { name: "Payment retries exhausted" })).toBeVisible();
  await expect(page.getByTestId("timeline-status")).toContainText("live");
  expect(detailRequests).toBe(1);
  await page.getByRole("button", { name: "Queue" }).click();
  await page.getByRole("button", { name: /Payment retries exhausted/ }).click();
  await expect(page.getByRole("heading", { name: "Payment retries exhausted" })).toBeVisible();
  expect(detailRequests).toBe(1);
  await page.getByLabel("Assign incident").selectOption("Avery");
  await expect(page.getByLabel("Assign incident")).toHaveValue("Avery");
  await expect(page.getByRole("status")).toContainText("updated");

  await page.getByRole("button", { name: "Acknowledge", exact: true }).click();
  await expect(page.getByTestId("detail-incident-status")).toHaveText("acknowledged");
  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  await expect(page.getByTestId("detail-incident-status")).toHaveText("resolved");
  await page.getByRole("button", { name: "Reopen", exact: true }).click();
  await expect(page.getByTestId("detail-incident-status")).toHaveText("open");

  await page.getByRole("button", { name: "Start runbook" }).click();
  await expect(page.getByText("Confirm impact")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Runbook" }).getByText("running", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("succeeded");
  await page.getByRole("button", { name: "Start runbook" }).click();
  await expect(page.getByText("Confirm impact")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Start runbook" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText(/cancelled|succeeded/);

  await page.getByRole("button", { name: "Diagnostics" }).click();
  await expect(page.getByRole("complementary", { name: "Diagnostics" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export trace" }).click();
  expect((await download).suggestedFilename()).toBe("incident-console-trace.json");

  expect(browserErrors).toEqual([]);
});
