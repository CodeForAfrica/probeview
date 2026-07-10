<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This project uses Next.js 16+ with React 19+. APIs, conventions, and file
structure may differ from your training data. Before changing Next-specific
code, check the installed versions in `package.json`, read the relevant guide in
`node_modules/next/dist/docs/`, and heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project Notes

ProbeView is a self-hostable public status page for Grafana Synthetic
Monitoring data. It is intentionally small: no database, no background workers,
and no client-side secrets. The public UI reads Grafana Cloud Prometheus metrics
on the server, caches them, and falls back to realistic mock data when Grafana
credentials are missing or `MOCK=1`.

Human-facing docs already cover setup and behavior — read them before
re-deriving anything: `README.md`, `CONTRIBUTING.md`, `docs/configuration.md`
(every env var), and `docs/architecture.md` (data flow). Keep them in sync when
you change configuration or user-visible behavior.

## Stack and Tooling

- Package manager: `pnpm` 11+ (see `packageManager` in `package.json`).
- Runtime: Node.js 24+.
- Framework: Next.js App Router, React Server Components by default.
- Styling: Tailwind CSS v4+ in `app/globals.css`.
- Formatting/linting: Biome 2+ (`pnpm check` autofixes, `pnpm lint:ci` checks).
- Tests: Vitest for unit/component tests, Playwright for e2e.

Use these checks as appropriate for the change:

```bash
pnpm check
pnpm test
pnpm test:types
pnpm test:e2e
pnpm build
```

For narrow edits, run the smallest useful subset first, then broaden if the
change touches shared data flow, routing, config, or user-visible behavior.

## Important Paths

- `app/page.tsx` renders the overview page.
- `app/site/[id]/page.tsx` renders a per-service detail page.
- `app/layout.tsx` owns metadata, fonts, header, footer, and theme bootstrapping.
- `components/` contains presentational UI and hand-rolled SVG charts.
- `lib/config.ts` is the only place environment variables should be parsed.
- `lib/prometheus.ts` is the cached, `server-only` Prometheus HTTP client.
- `lib/synthetics.ts` discovers checks and computes status, uptime, and latency
  (also `server-only`).
- `lib/mock.ts` provides sample data for local/dev/CI without credentials.
- `lib/buckets.ts` bucketizes time-series ranges for the charts.
- `lib/format.ts` holds shared display formatting helpers.
- `lib/types.ts` is the shared domain type surface; extend it rather than
  redefining shapes locally.
- `docs/configuration.md` and `docs/architecture.md` explain expected behavior.
- `scripts/introspect.mjs` validates a real Grafana stack and metric names.

## Next.js Conventions in This Repo

- Route components are async Server Components unless they explicitly need
  client interactivity.
- In this Next.js version, dynamic route `params` and `searchParams` are awaited
  promises in route props. Preserve that pattern in `app/site/[id]/page.tsx`.
- Keep Grafana access server-only. Do not add `NEXT_PUBLIC_` to credentials, and
  do not pass tokens or raw auth details into Client Components.
- Data-fetching modules that use Prometheus or `next/cache` should remain
  server-only. Follow the existing `import "server-only"` pattern.
- Pages currently use ISR via `export const revalidate = 60`; if you change cache
  behavior, keep `REVALIDATE_SECONDS` and `config.revalidate` in mind.
- Use `next/link`, `next/font`, and App Router metadata APIs according to the
  local Next docs, not memory of older Next releases.

## Data and Configuration Rules

- Services are discovered dynamically from `sm_check_info`; avoid hardcoding
  service lists.
- PromQL queries should continue to support metric-name overrides from
  `SM_METRIC_*` (see `.env.example` for the full set).
- Missing Grafana env vars should keep the app usable through mock data.
- All branding and threshold behavior should stay environment-driven through
  `lib/config.ts`. The only `NEXT_PUBLIC_` vars are branding
  (`NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_SITE_TAGLINE`); credentials
  (`GRAFANA_PROM_*`) and thresholds (`UPTIME_*`, `CURRENT_WINDOW`) are
  server-side only.
- Keep the app read-only. Do not introduce persistence, incident management,
  cron jobs, or background workers unless explicitly requested.

## UI Guidance

- Preserve the compact status-page feel: dense, scannable, responsive, and
  accessible.
- Reuse existing components before adding new abstractions.
- The charts are dependency-free SVG components; do not add a charting library
  for small changes.
- Maintain the light/dark theme behavior in `ThemeToggle` and the pre-paint
  boot script in `app/layout.tsx`.

## Testing Notes

- Unit tests live next to the affected code in `lib/*.test.ts` and
  `components/*.test.tsx`.
- E2E tests live in `e2e/` and should pass without real Grafana credentials
  because mock data is the default fallback.
- When changing PromQL or Grafana integration behavior, prefer adding focused
  tests around query construction/parsing and update docs if configuration
  expectations change.
