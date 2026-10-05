import { expect, test } from "@playwright/test";

test.describe("shared journey page", () => {
  test("shows a live journey with telemetry and a moving marker", async ({ page }) => {
    await page.goto("/journey/demo");
    await expect(page.getByRole("heading", { name: "Ahmedabad → Gandhinagar" })).toBeVisible();
    await expect(page.getByText("Live journey")).toBeVisible();
    await expect(page.getByText("Driving")).toBeVisible();
    await expect(page.getByText("Arrives")).toBeVisible();
    await expect(page.getByText("remaining")).toBeVisible();
    await expect(page.getByText("Simulated with Wave")).toBeVisible();

    const marker = page.locator("svg g[data-paused]");
    const before = await marker.getAttribute("transform");
    await page.waitForTimeout(1500);
    const after = await marker.getAttribute("transform");
    expect(before).not.toBeNull();
    expect(after).not.toBe(before);
  });

  test("shows paused, scheduled, completed and static states", async ({ page }) => {
    await page.goto("/journey/demo?state=paused");
    await expect(page.getByText("Journey paused")).toBeVisible();
    const marker = page.locator("svg g[data-paused]");
    await expect(marker).toHaveAttribute("data-paused", "true");
    const t1 = await marker.getAttribute("transform");
    await page.waitForTimeout(800);
    expect(await marker.getAttribute("transform")).toBe(t1);

    await page.goto("/journey/demo?state=scheduled");
    await expect(page.getByText("Starts in")).toBeVisible();

    await page.goto("/journey/demo?state=completed");
    await expect(page.getByText("Journey completed")).toBeVisible();
    await expect(page.getByText("Total distance")).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");

    await page.goto("/journey/demo?state=static");
    await expect(page.getByText("Shared location")).toBeVisible();
  });

  test("is never indexed and previews reveal nothing", async ({ page }) => {
    const response = await page.goto("/journey/demo");
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");
    expect(response?.headers()["cache-control"]).toContain("no-store");
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "A live journey was shared with you",
    );
  });

  test("explains unconfigured or invalid links", async ({ page }) => {
    await page.goto("/journey/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    await expect(page.getByRole("heading", { name: /went wrong|isn't available/ })).toBeVisible();
  });
});
