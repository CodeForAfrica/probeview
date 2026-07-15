import { expect, type Page, test } from "@playwright/test";

// Detail page assertions against the deterministic MOCK fixtures (lib/mock.ts):
// "PesaCheck" is operational, "africanDRONE" is down. Public ids carry a hash
// suffix, so resolve each detail URL from its overview link rather than
// hardcoding it.
async function gotoSite(page: Page, linkName: RegExp): Promise<void> {
  await page.goto("/");
  const href = await page
    .getByRole("link", { name: linkName })
    .getAttribute("href");
  if (!href) throw new Error(`No overview link matching ${linkName}`);
  await page.goto(href);
}

test.describe("site detail page", () => {
  test("renders an operational service's details", async ({ page }) => {
    await gotoSite(page, /PesaCheck/);

    await expect(
      page.getByRole("heading", { name: "PesaCheck" }),
    ).toBeVisible();
    await expect(page.getByText("Operational")).toBeVisible();

    // External link to the probed target, protocol stripped in the label.
    const target = page.getByRole("link", { name: /pesacheck\.org/ });
    await expect(target).toHaveAttribute("href", "https://pesacheck.org");
    await expect(target).toHaveAttribute("target", "_blank");

    // The uptime grid covers every window.
    for (const label of [
      "24 hours uptime",
      "7 days uptime",
      "30 days uptime",
      "1 year uptime",
    ]) {
      await expect(page.getByText(label)).toBeVisible();
    }

    // The data charts render with real points.
    await expect(
      page.getByRole("img", { name: "Response time over time" }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Uptime history" }),
    ).toBeVisible();

    // Back to the overview.
    await expect(
      page.getByRole("link", { name: "All services" }),
    ).toHaveAttribute("href", "/");
  });

  test("marks a down service as down with no current response time", async ({
    page,
  }) => {
    await gotoSite(page, /africanDRONE/);
    await expect(
      page.getByRole("heading", { name: "africanDRONE" }),
    ).toBeVisible();
    await expect(page.getByText("Down")).toBeVisible();
    // responseMs is null for a down service → formatted as an em dash.
    await expect(page.getByText("now —")).toBeVisible();
  });

  test("switches the window via the tab links", async ({ page }) => {
    await gotoSite(page, /PesaCheck/);
    await page.getByRole("link", { name: "30d", exact: true }).click();
    await expect(page).toHaveURL(/\/site\/pesacheck-[a-z0-9]+\?window=30d$/);
    await expect(
      page.getByRole("heading", { name: "PesaCheck" }),
    ).toBeVisible();
  });

  test("shows an error for an unknown service", async ({ page }) => {
    await page.goto("/site/does-not-exist");
    await expect(
      page.getByText('No monitored service found for "does-not-exist".'),
    ).toBeVisible();
    // The back link is still available to escape the error.
    await expect(
      page.getByRole("link", { name: "All services" }),
    ).toBeVisible();
  });
});
