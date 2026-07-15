import { expect, test } from "@playwright/test";

test("boots the Phase 6 Next.js scaffold and runs a Chromium interaction", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Incident Console" })).toBeVisible();
  await expect(page.getByText("Ready for an interaction check.")).toBeVisible();

  await page.getByRole("button", { name: "Verify interaction" }).click();

  await expect(page.getByText("Chromium interaction verified.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Verified" })).toBeDisabled();
  expect(browserErrors).toEqual([]);
});
