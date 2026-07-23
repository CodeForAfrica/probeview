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
Server Components    app/page.tsx (overview, ISR), app/site/[id]/page.tsx (detail, dynamic)
        │            detail freshness ← cache above; overview ← max(cache, ISR interval)
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
| [`lib/synthetics.ts`](../lib/synthetics.ts) | Domain layer. `listChecks()` discovers services from `sm_check_info` (incl. optional `group`/`purpose` from custom labels); `getOverview()` computes status + uptime across windows; `getSiteHistory()` builds the detail-page series. |
| [`lib/mock.ts`](../lib/mock.ts) | Representative sample data used when credentials are absent or `MOCK=1`. |
| [`lib/buckets.ts`](../lib/buckets.ts) | Bucketing helpers for the uptime history strip. |
| [`lib/types.ts`](../lib/types.ts) | Shared types: `Status`, `WindowKey`, `Check`, `CheckStatus`, etc. |
| [`components/`](../components) | Presentational components. Charts (`ResponseTimeChart`, `UptimeBars`) are **hand-rolled SVG** — no charting library. |

## Key decisions

- **Services are discovered, not configured.** Adding or removing a synthetic
  check in Grafana is automatically reflected — there is no service list to
  maintain in this repo. See `listChecks()`.

- **Grouping is a projection of Grafana labels, not a second inventory.**
  Optional overview grouping is driven entirely by a Grafana Synthetic
  Monitoring [custom label](https://grafana.com/docs/grafana-cloud/testing/synthetic-monitoring/analyze-results/custom-labels/) (`SM_GROUP_LABEL`, with an optional
  `SM_PURPOSE_LABEL` for a per-row chip). `listChecks()` reads the label off
  `sm_check_info`'s `label_<name>` field into the check's `group` / `purpose`
  fields; the overview then groups on the client. No group membership is
  hardcoded, so groups never drift from the discovered checks. Unset labels ⇒
  the flat list is unchanged; checks missing a value render as plain rows
  interleaved among the groups by the active sort.
  See [`configuration.md`](configuration.md#grouping-by-custom-label).


- **Check ids identify a `(job, target)` pair, not a job name.** Grafana defines
  a check's identity as job name + target, so two checks can share a job name (or
  two job names can normalize to the same slug, e.g. `Public API` and
  `Public-API`). Each check's id is therefore `<job-slug>-<hash>`, where the hash
  is a stable digest of the full `(job, target)` identity - see `checkId()` in
  [`lib/format.ts`](../lib/format.ts). Because the hash depends only on the
  check's own identity, an id never changes when some *other* check is added,
  removed, or renamed; it only changes if that check's own job or target changes.
  The readable slug leads so `/site/<id>` URLs stay scannable and sort by service
  name. Migration note: ids are `slug-hash`, not a bare slug, so any externally
  saved deep links must be regenerated.

- **Uptime is computed from `probe_all_*` counters.** On Grafana Cloud the raw
  `probe_success` metric is aggregated and can't be queried directly, so uptime
  and current status are derived from the success sum/count counters over the
  configured windows (and [`CURRENT_WINDOW`](configuration.md#current-updown-window)
  for the live dot).

- **Data freshness is governed by one cache layer.** The Prometheus client and
  the `lib/synthetics.ts` accessors cache responses for
  [`METRICS_CACHE_SECONDS`](configuration.md#metrics_cache_seconds), which bounds
  how often Grafana is queried no matter how much public traffic arrives. The
  overview's `updated` value is stamped inside that cache, so it reports true
  metric freshness rather than render time.

- **Route rendering is separate from the data cache.** `METRICS_CACHE_SECONDS`
  cannot set a route's ISR interval — Next requires that to be a static literal
  — so the overview (`/`) uses a fixed `revalidate` literal (60s) and the detail
  route (`/site/[id]`) is rendered on demand because it reads `searchParams`.
  The detail route reads cached data on every request, so its freshness is
  bounded by `METRICS_CACHE_SECONDS`. The overview page is different: its HTML is
  only regenerated when the segment revalidates, so effective overview freshness
  is `max(revalidate, METRICS_CACHE_SECONDS)` — lowering `METRICS_CACHE_SECONDS`
  below the 60s ISR floor does not make `/` any fresher, it only speeds up the
  detail route.

- **Coverage is honest, not optimistic.** A window longer than what the plan
  retains ([`METRICS_RETENTION_DAYS`](configuration.md#metrics_retention_days))
  can't be reported truthfully, so the data layer skips its query and marks it
  insufficient (`—`) rather than computing a confident ratio over a partial
  range; the selected-window charts are clamped to the retained span. The window
  itself stays visible — coverage is disclosed, not hidden. Retention is
  resolved server-side and passed to Client Components as a plain `retentionDays`
  prop (see `windowWithinRetention` in [`lib/types.ts`](../lib/types.ts)); the
  env var stays server-only. Unset ⇒ unlimited ⇒ unchanged behavior.

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
