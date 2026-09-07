import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const run = promisify(execFile);
const apiUrl = process.env.INCIDENT_API_URL ?? "http://127.0.0.1:5190";

const reset = async (request: APIRequestContext) => {
  const response = await request.post(`${apiUrl}/__dev/reset`, { data: { seed: "normal" } });
  expect(response.ok()).toBe(true);
};

const arm = async (request: APIRequestContext, fault: string) => {
  const response = await request.post(`${apiUrl}/__dev/faults`, { data: { fault } });
  expect(response.ok()).toBe(true);
};

const openIncident = async (page: Page, title = "Payment retries exhausted") => {
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByTestId("timeline-status")).toContainText("live");
};

const incident = async (request: APIRequestContext, id = "INC-002") => {
  const response = await request.get(`${apiUrl}/api/incidents/${id}`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as {
    readonly id: string;
    readonly version: number;
    readonly assignee: string | null;
    readonly status: "open" | "acknowledged" | "resolved";
  };
};

test.beforeEach(async ({ request }) => reset(request));

test("reconciles two optimistic operators through a real delayed 409", async ({
  browser,
  request,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await Promise.all([openIncident(pageA), openIncident(pageB)]);

  await arm(request, "delayed-patch");
  const delayedRequest = pageB.waitForRequest(
    (candidate) => candidate.method() === "PATCH" && candidate.url().endsWith("/INC-002"),
  );
  await pageB.getByLabel("Assign incident").selectOption("Morgan");
  await delayedRequest;
  await pageA.getByLabel("Assign incident").selectOption("Riley");

  await expect(pageA.getByLabel("Assign incident")).toHaveValue("Riley");
  const conflict = pageB.getByRole("alert").filter({ hasText: "changed on the server" });
  await expect(conflict).toContainText("Riley");
  await expect(
    pageA.getByRole("region", { name: "Timeline" }).getByText("Assigned to Riley"),
  ).toHaveCount(1);
  await expect(
    pageB.getByRole("region", { name: "Timeline" }).getByText("Assigned to Riley"),
  ).toHaveCount(1);

  await pageB.getByRole("button", { name: "Accept server version" }).click();
  await expect(pageB.getByLabel("Assign incident")).toHaveValue("Riley");
  await expect(conflict).toHaveCount(0);

  await Promise.all([contextA.close(), contextB.close()]);
  const status = await request.get(`${apiUrl}/__dev/status?waitForSubscribers=0`);
  expect(await status.json()).toMatchObject({ subscribers: 0 });
});

test("suppresses stale list generations and handles removed detail", async ({ page, request }) => {
  await page.goto("/");
  await arm(request, "delayed-response");
  await page.getByLabel("Service filter").selectOption("api");
  await page.getByLabel("Service filter").selectOption("billing");
  await expect(page.getByRole("button", { name: /Payment retries exhausted/ })).toBeVisible();
  const rows = page.getByRole("region", { name: "Incident queue" }).getByRole("button", {
    name: /INC-/,
  });
  for (let index = 0; index < (await rows.count()); index += 1) {
    await expect(rows.nth(index)).toContainText("billing");
  }

  await reset(request);
  await page.reload();
  await arm(request, "delayed-response");
  await arm(request, "remove-before-detail");
  await page.getByRole("button", { name: /Payment retries exhausted/ }).click();
  await expect(page.getByText("Incident no longer exists.", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Payment retries exhausted" })).toHaveCount(0);
  await page.getByRole("button", { name: /Elevated API latency/ }).click();
  await expect(page.getByRole("heading", { name: "Elevated API latency" })).toBeVisible();

  await page.getByRole("button", { name: /Login token verification errors/ }).click();
  await expect(
    page.getByRole("heading", { name: "Login token verification errors" }),
  ).toBeVisible();
  await expect(page.getByTestId("timeline-status")).toContainText("live");
  const oldDetail = await incident(request, "INC-001");
  const oldStreamEvent = await request.patch(`${apiUrl}/api/incidents/${oldDetail.id}`, {
    data: { expectedVersion: oldDetail.version, assignee: "Avery" },
  });
  expect(oldStreamEvent.ok()).toBe(true);
  const currentDetail = await incident(request, "INC-003");
  const currentStreamEvent = await request.patch(`${apiUrl}/api/incidents/${currentDetail.id}`, {
    data: { expectedVersion: currentDetail.version, assignee: "Morgan" },
  });
  expect(currentStreamEvent.ok()).toBe(true);
  await expect(
    page.getByRole("region", { name: "Timeline" }).getByText("Assigned to Morgan"),
  ).toHaveCount(1);
  await expect(
    page.getByRole("region", { name: "Timeline" }).getByText("Assigned to Avery"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Login token verification errors" }),
  ).toBeVisible();
  const status = await request.get(`${apiUrl}/__dev/status`);
  expect(await status.json()).toMatchObject({ subscribers: 1 });
});

test("keeps shifted cursor pages usable without duplicates", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Elevated API latency/ })).toBeVisible();
  const firstPageIds = await page
    .getByRole("region", { name: "Incident queue" })
    .getByRole("button", { name: /INC-/ })
    .evaluateAll((rows) => rows.map((row) => row.textContent?.match(/INC-\d+/)?.[0]));
  await arm(request, "shift-before-list");
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByRole("button", { name: /Identity provider timeout/ })).toBeVisible();
  const secondPageIds = await page
    .getByRole("region", { name: "Incident queue" })
    .getByRole("button", { name: /INC-/ })
    .evaluateAll((rows) => rows.map((row) => row.textContent?.match(/INC-\d+/)?.[0]));
  const ids = [...firstPageIds, ...secondPageIds];
  expect(ids).not.toContain(undefined);
  expect(new Set(ids).size).toBe(ids.length);
});

test("keeps cached detail through 503 and malformed 200 responses", async ({ page, request }) => {
  await openIncident(page);
  await arm(request, "refresh-503");
  await page.getByRole("button", { name: "Refresh detail" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Detail refresh unavailable" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Payment retries exhausted" })).toBeVisible();
  await page.getByRole("button", { name: "Refresh detail" }).click();
  await expect(page.getByRole("status")).toContainText("refreshed");

  await arm(request, "malformed-detail");
  await page.getByRole("button", { name: "Refresh detail" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Invalid incident detail response" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Payment retries exhausted" })).toBeVisible();
  await page.getByRole("button", { name: "Refresh detail" }).click();
  await expect(page.getByRole("status")).toContainText("refreshed");
});

test("reconnects SSE with replay once and reconciles external fields", async ({
  page,
  request,
}) => {
  await openIncident(page);
  await arm(request, "sse-disconnect");
  await expect(page.getByTestId("timeline-status")).toContainText("reconnecting");
  const current = await incident(request);
  const response = await request.patch(`${apiUrl}/api/incidents/${current.id}`, {
    data: { expectedVersion: current.version, assignee: "Riley" },
  });
  expect(response.ok()).toBe(true);

  const assignmentEvent = page
    .getByRole("region", { name: "Timeline" })
    .getByText("Assigned to Riley");
  await expect(assignmentEvent).toHaveCount(1);
  await expect(page.getByTestId("timeline-status")).toContainText("live", { timeout: 10_000 });
  await expect(assignmentEvent).toHaveCount(1);
  await expect(page.getByLabel("Assign incident")).toHaveValue("Riley");
  await expect(page.getByText("Refreshing…")).toHaveCount(0);

  await arm(request, "timeline-burst");
  await expect(page.getByTestId("timeline-gap")).toBeVisible();
  await expect(page.getByText("Bounded timeline burst 120")).toHaveCount(1);
  expect(
    await page.getByRole("region", { name: "Timeline" }).locator("ol > li").count(),
  ).toBeLessThanOrEqual(100);
});

test("preserves server authority when SSE arrives during a delayed preview", async ({
  page,
  request,
}) => {
  await openIncident(page);
  const before = await incident(request);
  await arm(request, "delayed-patch");
  const delayedRequest = page.waitForRequest(
    (candidate) => candidate.method() === "PATCH" && candidate.url().endsWith("/INC-002"),
  );
  await page.getByLabel("Assign incident").selectOption("Morgan");
  await delayedRequest;
  const external = await request.patch(`${apiUrl}/api/incidents/${before.id}`, {
    data: { expectedVersion: before.version, status: "acknowledged" },
  });
  expect(external.ok()).toBe(true);

  await expect(page.getByText("Status changed to acknowledged")).toHaveCount(1);
  await expect(page.getByRole("alert").filter({ hasText: "changed on the server" })).toBeVisible();
  await page.getByRole("button", { name: "Accept server version" }).click();
  await expect(page.getByTestId("detail-incident-status")).toHaveText("acknowledged");
  await expect(page.getByLabel("Assign incident")).toHaveValue(before.assignee ?? "unassigned");
});

test("fails, replaces, races, and cancels runbook generations", async ({ page, request }) => {
  await openIncident(page);
  await arm(request, "runbook-failure");
  await page.getByRole("button", { name: "Start runbook" }).click();
  await expect(page.getByText("Confirm impact")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("failed");
  await expect(page.getByRole("button", { name: "Start runbook" })).toBeVisible();

  await page.getByRole("button", { name: "Start runbook" }).click();
  await expect(page.getByText("Confirm impact")).toBeVisible();
  await arm(request, "runbook-cancel-race");
  await page.getByRole("button", { name: "Replace" }).click();
  await expect(page.getByRole("status")).toContainText(/Replacing runbook|started/);
  await expect(page.getByText("Confirm impact")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("status")).toContainText("cancelled");
  const status = await request.get(`${apiUrl}/__dev/status`);
  expect(await status.json()).toMatchObject({ activeRunbooks: 0 });
});

test("tears down and recreates the runtime without ghost work", async ({ page, request }) => {
  await openIncident(page);
  await arm(request, "delayed-patch");
  const pendingPatch = page.waitForRequest(
    (candidate) => candidate.method() === "PATCH" && candidate.url().endsWith("/INC-002"),
  );
  await page.getByLabel("Assign incident").selectOption("Morgan");
  await pendingPatch;
  await page.getByRole("button", { name: "Exit console" }).click();
  await expect(page.getByRole("heading", { name: "Incident Console closed" })).toBeVisible();
  const mutationStopped = await request.get(`${apiUrl}/__dev/status?waitForSubscribers=0`);
  expect(await mutationStopped.json()).toMatchObject({ subscribers: 0, activeRunbooks: 0 });

  await page.getByRole("button", { name: "Reopen console" }).click();
  await expect(page.getByRole("button", { name: /Elevated API latency/ })).toBeVisible();
  await openIncident(page, "Elevated API latency");
  await page.getByRole("button", { name: "Start runbook" }).click();
  await expect(page.getByText("Confirm impact")).toBeVisible();
  await page.getByRole("button", { name: "Exit console" }).click();
  await expect(page.getByRole("heading", { name: "Incident Console closed" })).toBeVisible();
  const stopped = await request.get(`${apiUrl}/__dev/status?waitForSubscribers=0`);
  expect(await stopped.json()).toMatchObject({ subscribers: 0, activeRunbooks: 0 });

  await page.getByRole("button", { name: "Reopen console" }).click();
  await expect(page.getByRole("button", { name: /Elevated API latency/ })).toBeVisible();
  await openIncident(page, "Elevated API latency");
  const reopened = await request.get(`${apiUrl}/__dev/status`);
  expect(await reopened.json()).toMatchObject({ subscribers: 1, activeRunbooks: 0 });
});

test("recovers after the standalone API process restarts", async ({ page, request }) => {
  test.skip(process.env.ACCEPTANCE !== "1", "restart requires the isolated acceptance supervisor");
  await openIncident(page);
  await page.getByRole("button", { name: "Start runbook" }).click();
  await expect(page.getByText("Confirm impact")).toBeVisible();
  const delayedRunbookRequest = page.waitForRequest(
    (candidate) => candidate.method() === "GET" && candidate.url().includes("/api/runbooks/"),
  );
  await arm(request, "delayed-runbook");
  await delayedRunbookRequest;

  await run("nub", ["run", "scenario", "restart-api"], {
    cwd: process.cwd(),
    env: { ...process.env, INCIDENT_API_URL: apiUrl },
  });
  await expect(page.getByTestId("api-status")).toContainText(/reconnecting|failed|degraded/);
  await expect(page.getByTestId("api-status")).toContainText("live", { timeout: 15_000 });
  await page.getByRole("button", { name: "Refresh detail" }).click();
  await expect(page.getByRole("status")).toContainText("refreshed");
  const status = await request.get(`${apiUrl}/__dev/status`);
  expect(await status.json()).toMatchObject({ subscribers: 1, activeRunbooks: 0 });
});

