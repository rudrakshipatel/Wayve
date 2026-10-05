import { expect, test, type Page } from "@playwright/test";

const tap = async (page: Page, name: string | RegExp) => {
  await page
    .getByRole("button", { name, exact: typeof name === "string" })
    .first()
    .click();
};

async function pick(page: Page, field: string, query: string, result: string) {
  await page.getByLabel(field).fill(query);
  await tap(page, result);
}

test("create, start, share, control, complete and replay a journey", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect(page.getByText("Preview mode")).toBeVisible();
  await tap(page, "New journey");

  // Steps 1–3: start, destination, a waypoint.
  await pick(page, "Search a start address or place", "Ahmed", "Ahmedabad");
  await pick(page, "Search an address or place", "Gandhi", "Gandhinagar");
  await expect(page.getByText("Any stops on the way?")).toBeVisible();
  await tap(page, "Add a stop");
  await page
    .getByRole("button", { name: /Stop 1/ })
    .first()
    .click();
  await pick(page, "Search an address or place", "Thal", "Thaltej");
  await tap(page, "Continue");

  // Step 4: route alternatives.
  await expect(page.getByText("Pick a route")).toBeVisible();
  await expect(page.getByText("Alternative 1").first()).toBeVisible();
  await page.getByRole("radio").nth(1).click();
  await tap(page, "Continue");

  // Step 5: per-leg modes (advanced designer).
  await page.getByRole("tab", { name: "Per leg" }).click();
  await page.getByRole("button", { name: "Walking" }).nth(1).click();
  await tap(page, "Continue");

  // Step 6: speed and timing.
  await expect(page.getByText("Speed and timing")).toBeVisible();
  await expect(page.getByText("5 km/h")).toBeVisible();
  await tap(page, "Increase Speed");
  await tap(page, "Continue");

  // Step 7: preview and start.
  await expect(page.getByText("Est. duration")).toBeVisible();
  await tap(page, "Start simulation");

  // Share sheet opens automatically.
  await expect(page.getByText("Share live link")).toBeVisible();
  await tap(page, "Create secure link");
  await expect(page.getByText(/https:\/\/wave\.app\/journey\/[A-Za-z0-9_-]{43}/)).toBeVisible();
  await expect(page.getByRole("button", { name: "WhatsApp" })).toBeVisible();
  await tap(page, "Close");

  // Active journey controls.
  await expect(page.getByText("Arrives")).toBeVisible();
  await tap(page, "Pause");
  await expect(page.getByText("Paused").first()).toBeVisible();
  await tap(page, "Resume");
  await tap(page, "5×");
  await tap(page, "Thaltej");
  await expect(page.getByText(/leg 2 of 2/)).toBeVisible();
  await tap(page, "Stop");
  await expect(page.getByText("Journey stopped")).toBeVisible();

  // Replay at 10×.
  await tap(page, "Replay");
  await tap(page, "10×");
  await expect(page.getByText("Replay · 10×")).toBeVisible();

  // Back home: the journey is in Recent journeys and in History with its actions.
  await tap(page, "Back");
  await tap(page, "Back");
  await expect(page.getByText("Recent journeys")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Ahmedabad → Gandhinagar, Stopped/ }),
  ).toBeVisible();
  await tap(page, "History");
  await tap(page, "Options for Ahmedabad → Gandhinagar");
  for (const action of ["View", "Replay", "Duplicate", "Rename", "Delete"]) {
    await expect(page.getByRole("button", { name: action, exact: true })).toBeVisible();
  }
  await tap(page, "Duplicate");
  await expect(
    page.getByText("Ahmedabad → Gandhinagar (copy)").filter({ visible: true }),
  ).toBeVisible();
  // A duplicate is a fresh draft that can be started.
  await tap(page, "Start simulation");
  await expect(page.getByText("Arrives").filter({ visible: true })).toBeVisible();

  expect(errors).toEqual([]);
});

test("save and share a static location", async ({ page }) => {
  await page.goto("/");
  await tap(page, "Static location");
  await pick(page, "Search an address or place", "Kank", "Kankaria Lake");
  await page.getByRole("button", { name: "Work" }).click();
  await tap(page, "Save");
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  await tap(page, "Share");
  await expect(page.getByText("Share live link")).toBeVisible();
});
