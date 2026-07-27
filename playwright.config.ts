import { defineConfig, devices } from "@playwright/test";

// End-to-end tests cover the async Server Components (app/page.tsx and
// app/site/[id]/page.tsx) that Vitest can't render. `MOCK=1` forces the
// deterministic fixtures in lib/mock.ts, so runs need no Grafana secrets and
// assertions can rely on stable data.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Fail CI if a `test.only` was committed by accident.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Test against a production build, as Next.js recommends. Locally, a server
  // already on :3000 (e.g. `pnpm dev`) is reused so you skip the build. In CI
  // the build runs as its own workflow step (so a build failure is reported
  // distinctly from a test failure), so here we only start the prebuilt server.
  webServer: {
    command: process.env.CI ? "pnpm start" : "pnpm build && pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { MOCK: "1" },
  },
});
