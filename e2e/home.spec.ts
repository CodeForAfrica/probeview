import { expect, test } from "@playwright/test";

// These assertions rely on the deterministic fixtures in lib/mock.ts (the
// server runs with MOCK=1, see playwright.config.ts). Of the ten fixture
// checks, only "PesaCheck Admin" is down, so the system is a partial outage
// with nine operational. The fixtures also carry group labels, so the overview
// renders grouped sections (PesaCheck, sensors.AFRICA) plus an "Other services"
// fallback for the ungrouped checks.
test.describe("home page", () => {
  test("shows the overall status banner and operational count", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Partial system outage" }),
    ).toBeVisible();
    await expect(page.getByText("9/10 services operational")).toBeVisible();
  });

  test("notes that sample data is in use", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Showing sample data")).toBeVisible();
  });

  test("renders named group sections with honest impact summaries", async ({
    page,
  }) => {
    await page.goto("/");
    // Group headings are level-3 headings, distinct from the row links.
    await expect(
      page.getByRole("heading", { level: 3, name: "PesaCheck" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "sensors.AFRICA" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "Other services" }),
    ).toBeVisible();
    // PesaCheck has one down member of three — reported as affected, never as a
    // blanket "Down" for the whole group.
    await expect(page.getByText("1 of 3 affected")).toBeVisible();
  });

  test("collapses a group and remembers it after a reload", async ({
    page,
  }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: /PesaCheck/ });
    const memberRow = page.getByRole("link", { name: /admin\.pesacheck\.org/ });

    // Expanded by default.
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(memberRow).toBeVisible();

    // Collapsing hides the rows but keeps the impact summary in the header.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(memberRow).toBeHidden();
    await expect(page.getByText("1 of 3 affected")).toBeVisible();

    // The collapsed state survives a reload (persisted in localStorage).
    await page.reload();
    await expect(
      page.getByRole("button", { name: /PesaCheck/ }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(
      page.getByRole("link", { name: /admin\.pesacheck\.org/ }),
    ).toBeHidden();
  });

  test("links each service to its detail page", async ({ page }) => {
    await page.goto("/");
    // Ids are the readable slug plus a stable hash suffix. Match rows by their
    // (unique) target host, since several checks share the "PesaCheck" name.
    await expect(
      page.getByRole("link", { name: /thecontinent\.org/ }),
    ).toHaveAttribute("href", /^\/site\/the-continent-[a-z0-9]+$/);
    await expect(
      page.getByRole("link", { name: /admin\.pesacheck\.org/ }),
    ).toHaveAttribute("href", /^\/site\/pesacheck-admin-[a-z0-9]+$/);
  });

  test("navigates to a service detail page when a row is clicked", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /thecontinent\.org/ }).click();
    await expect(page).toHaveURL(/\/site\/the-continent-[a-z0-9]+$/);
    await expect(
      page.getByRole("heading", { name: "The Continent" }),
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
