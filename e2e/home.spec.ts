import { expect, test } from "@playwright/test";

// These assertions rely on the deterministic fixtures in lib/mock.ts (the
// server runs with MOCK=1, see playwright.config.ts). Of the eight fixture
// services, only "africanDRONE" is down, so the system is a partial outage
// with seven operational.
test.describe("home page", () => {
  test("shows the overall status banner and operational count", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Partial system outage" }),
    ).toBeVisible();
    await expect(page.getByText("7/8 services operational")).toBeVisible();
  });

  test("notes that sample data is in use", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Showing sample data")).toBeVisible();
  });

  test("links each service to its detail page", async ({ page }) => {
    await page.goto("/");
    // Ids are the readable slug plus a stable hash suffix.
    await expect(page.getByRole("link", { name: /PesaCheck/ })).toHaveAttribute(
      "href",
      /^\/site\/pesacheck-[a-z0-9]+$/,
    );
    await expect(
      page.getByRole("link", { name: /africanDRONE/ }),
    ).toHaveAttribute("href", /^\/site\/africandrone-[a-z0-9]+$/);
  });

  test("navigates to a service detail page when a row is clicked", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /PesaCheck/ }).click();
    await expect(page).toHaveURL(/\/site\/pesacheck-[a-z0-9]+$/);
    await expect(
      page.getByRole("heading", { name: "PesaCheck" }),
    ).toBeVisible();
  });

  // "Public API" and "Public-API" both slugify to "public-api" but target
  // different URLs — the classic collision this fixture guards against. Each
  // row must have its own link, and each link must open the intended target.
  test("gives checks with colliding job slugs distinct, working links", async ({
    page,
  }) => {
    await page.goto("/");

    // Rows are disambiguated by their (unique) targets in the link label.
    const orgLink = page.getByRole("link", { name: /api\.example\.org/ });
    const netLink = page.getByRole("link", { name: /api\.example\.net/ });

    const orgHref = await orgLink.getAttribute("href");
    const netHref = await netLink.getAttribute("href");
    expect(orgHref).toBeTruthy();
    expect(netHref).toBeTruthy();
    expect(orgHref).not.toBe(netHref);

    // Each link resolves to a detail page for its own target.
    await orgLink.click();
    await expect(
      page.getByRole("link", { name: /api\.example\.org/ }),
    ).toHaveAttribute("href", "https://api.example.org");

    await page.goto("/");
    await netLink.click();
    await expect(
      page.getByRole("link", { name: /api\.example\.net/ }),
    ).toHaveAttribute("href", "https://api.example.net");
  });
});
