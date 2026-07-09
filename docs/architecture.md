# Architecture

A short tour of how ProbeView turns Grafana Synthetic Monitoring metrics into
the public dashboard. The goal: **read-only, stateless, cheap to serve**.

## Data flow

```
Grafana Synthetics   probes your targets and writes results as Prometheus metrics
        │
        ▼
Prometheus / Mimir   stores sm_check_info + probe_all_* counters in Grafana Cloud
        │  (HTTPS query API, basic auth)
        ▼
lib/prometheus.ts    minimal cached HTTP client: instantQuery / rangeQuery
        │
        ▼
lib/synthetics.ts    listChecks → getOverview → getSiteHistory
        │            (discover services, compute uptime/status/latency)
        ▼
Server Components    app/page.tsx (overview), app/site/[id]/page.tsx (detail)
        │            ISR via `export const revalidate`
        ▼
components/*         presentational UI + hand-rolled SVG charts
```

There is **no database, no cron, and no client-side data fetching.** Each page
render asks `lib/synthetics.ts` for plain data; that layer queries Prometheus
(through a cache) and returns typed objects. The browser only ever receives
already-computed numbers and markup.

## Modules

| Module | Responsibility |
| --- | --- |
| [`lib/config.ts`](../lib/config.ts) | All environment-driven configuration, read once. Decides mock vs. live. |
| [`lib/prometheus.ts`](../lib/prometheus.ts) | Cached HTTP client for the Prometheus query API. `instantQuery` (point-in-time) and `rangeQuery` (time series). `escapeLabel` for safe PromQL. |
| [`lib/synthetics.ts`](../lib/synthetics.ts) | Domain layer. `listChecks()` discovers services from `sm_check_info`; `getOverview()` computes status + uptime across windows; `getSiteHistory()` builds the detail-page series. |
| [`lib/mock.ts`](../lib/mock.ts) | Representative sample data used when credentials are absent or `MOCK=1`. |
| [`lib/buckets.ts`](../lib/buckets.ts) | Bucketing helpers for the uptime history strip. |
| [`lib/types.ts`](../lib/types.ts) | Shared types: `Status`, `WindowKey`, `Check`, `CheckStatus`, etc. |
| [`components/`](../components) | Presentational components. Charts (`ResponseTimeChart`, `UptimeBars`) are **hand-rolled SVG** — no charting library. |

## Key decisions

- **Services are discovered, not configured.** Adding or removing a synthetic
  check in Grafana is automatically reflected — there is no service list to
  maintain in this repo. See `listChecks()`.

- **Uptime is computed from `probe_all_*` counters.** On Grafana Cloud the raw
  `probe_success` metric is aggregated and can't be queried directly, so uptime
  and current status are derived from the success sum/count counters over the
  configured windows (and [`CURRENT_WINDOW`](configuration.md#current-updown-window)
  for the live dot).

- **Caching happens in two layers.** The Prometheus client caches responses, and
  pages use ISR — both governed by
  [`REVALIDATE_SECONDS`](configuration.md#revalidate_seconds). This keeps public
  traffic from translating one-to-one into Prometheus queries.

- **Secrets stay on the server.** The Grafana credentials have no
  `NEXT_PUBLIC_` prefix, so they are only ever read in Server Components / the
  data layer and never reach the browser bundle.

## Routes

| Route | File | Purpose |
| --- | --- | --- |
| `/` | `app/page.tsx` | Overview of all services with search. |
| `/site/<id>` | `app/site/[id]/page.tsx` | Per-service uptime bars + response-time chart. |

## Extending it

- **Change branding** → env vars (`NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_SITE_TAGLINE`)
  for text; `app/layout.tsx` and `app/globals.css` for layout, logo, and theme.
- **Add a metric** → extend `lib/synthetics.ts` with a new query and surface it
  through a component. Keep computation in the data layer; keep components
  presentational.
- **Support a different metric schema** → the `SM_METRIC_*` env overrides cover
  renames without code changes. Use `scripts/introspect.mjs` to discover names.
