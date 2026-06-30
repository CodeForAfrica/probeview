import { expect, test } from "@playwright/test";

// These assertions rely on the deterministic fixtures in lib/mock.ts (the
// server runs with MOCK=1, see playwright.config.ts). Of the six fixture
// services, only "africanDRONE" is down, so the system is a partial outage
// with five operational.
test.describe("home page", () => {
  test("shows the overall status banner and operational count", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Partial system outage" }),
    ).toBeVisible();
    await expect(page.getByText("5/6 services operational")).toBeVisible();
  });

  test("notes that sample data is in use", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Showing sample data")).toBeVisible();
  });

  test("links each service to its detail page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /PesaCheck/ })).toHaveAttribute(
      "href",
      "/site/pesacheck",
    );
    await expect(
      page.getByRole("link", { name: /africanDRONE/ }),
    ).toHaveAttribute("href", "/site/african-drone");
  });

  test("navigates to a service detail page when a row is clicked", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /PesaCheck/ }).click();
    await expect(page).toHaveURL("/site/pesacheck");
    await expect(
      page.getByRole("heading", { name: "PesaCheck" }),
    ).toBeVisible();
  });
});
