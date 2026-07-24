# Configuration reference

Every ProbeView setting is an environment variable, read once in
[`lib/config.ts`](../lib/config.ts). In development, put them in `.env.local`
(copied from [`.env.example`](../.env.example)); in production, set them in your
host's environment. **Never commit `.env.local`.**

Only the three Grafana credentials are required — and even those are optional if
you only want to preview with sample data. Everything else has a sensible
default.

---

## Grafana Cloud credentials

These are read **server-side only** (note the lack of a `NEXT_PUBLIC_` prefix),
so the token is never shipped to the browser.

| Variable | Required | Example | Description |
| --- | --- | --- | --- |
| `GRAFANA_PROM_URL` | yes | `https://prometheus-prod-24-prod-eu-west-2.grafana.net/api/prom` | The Prometheus **query base URL**, including the `/api/prom` suffix. |
| `GRAFANA_PROM_USER` | yes | `123456` | The numeric **metrics instance ID**, used as the HTTP basic-auth username. |
| `GRAFANA_PROM_TOKEN` | yes | `glc_xxx…` | An **Access Policy token** scoped `metrics:read`, used as the basic-auth password. |

### Where to find them

1. In Grafana Cloud, go to your stack → **Prometheus → Details**. This shows the
   query URL and the metrics instance ID (the basic-auth user).
2. For the token, go to **Administration → Users and access → Cloud access
   policies**. Create a policy with the `metrics:read` scope, then create a token
   under it.

> If any of the three is missing, the app automatically falls back to sample
> data — see [`MOCK`](#mock) below.

---

## Preview / sample data

### `MOCK`

- **Default:** unset
- **Set to `1`** to force the app to serve representative sample data even when
  credentials are present. Useful for design work, demos, screenshots, and CI.

The app also serves sample data automatically whenever any of the three Grafana
credentials is absent, so a fresh clone with no `.env.local` "just works".

---

## Branding

| Variable | Default | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_NAME` | `Code for Africa` | Organisation / site name shown in the header and the page `<title>`. |
| `NEXT_PUBLIC_SITE_TAGLINE` | `Status of our public services` | Sub-heading / description text. |

> These are prefixed `NEXT_PUBLIC_` because they are rendered in the browser.
> That is expected and safe — they contain no secrets.

To go beyond text (logo, colours, fonts), edit the components directly:
`app/layout.tsx` for the header/footer and `app/globals.css` for the theme.

---

## Status thresholds

These uptime percentages drive the green / amber / red status colours.

| Variable | Default | Description |
| --- | --- | --- |
| `UPTIME_OPERATIONAL` | `99.9` | At or above this uptime %, a service is **operational** (green). |
| `UPTIME_DEGRADED` | `95` | At or above this %, a service is **degraded** (amber). Below it, **down** (red). |

The thresholds are applied to the rolling uptime windows. Set `UPTIME_OPERATIONAL`
to match your SLO (e.g. `99.95`).

---

## Current up/down window

### `CURRENT_WINDOW`

- **Default:** `1h`
- The window over which current reachability (the live up/down dot) is computed
  from the `probe_all_*` counters. Set it to a **small multiple of your check
  frequency** — e.g. if checks run every 5 minutes, `15m`–`1h` is reasonable.
  Too small and a single missed probe flips the service down; too large and
  recovery looks slow.

Accepts any Prometheus duration string (`5m`, `30m`, `1h`, `2h`, …).

---

## Caching

### `METRICS_CACHE_SECONDS`

- **Default:** `60`
- The **metrics-cache window**: how long Grafana/Prometheus responses are cached
  server-side (the `fetch` cache in `lib/prometheus.ts` and the `unstable_cache`
  wrappers in `lib/synthetics.ts`). Higher values mean fewer Prometheus queries
  (cheaper, but staler data); lower values mean fresher data at higher query
  cost. `60` is a good balance for most public pages.
- This is the knob for **how often Grafana is queried**. The overview's
  `updated` timestamp is derived from the actual fetch time (not the page render
  time), so it always reports the true age of the displayed metrics.

> **What it does _not_ control: the route-revalidation (ISR) interval.** Next.js
> requires a route's `revalidate` to be a statically-analyzable literal, so it
> cannot be driven by an environment variable. The overview route (`/`) uses a
> fixed `revalidate` literal (60s) and the detail route (`/site/[id]`) is
> server-rendered on demand (it reads the `?window=` search param).
>
> This matters for the overview page: its HTML — the metrics **and** the
> `updated` label — is only regenerated when the segment revalidates, so
> effective `/` freshness is `max(revalidate, METRICS_CACHE_SECONDS)`. Setting
> `METRICS_CACHE_SECONDS` **below** the 60s ISR floor does not make `/` query
> Grafana any fresher — visitors keep the same overview HTML until the route
> regenerates (and stale-while-revalidate serves the old HTML while regeneration
> runs in the background). It only speeds up the on-demand detail route. At or
> above the ISR interval, `METRICS_CACHE_SECONDS` is the effective bound on both
> routes.

---

## Metrics retention

### `METRICS_RETENTION_DAYS`

- **Default:** unset ⇒ **unlimited**
- The number of days your Grafana plan retains metrics. On the free Grafana
  Cloud plan this is ~14 days.

When set, any window longer than the retained span (e.g. `30d` and `1y` on a
14-day plan) is treated as **not fully covered**:

- Its uptime and response figures are reported as **insufficient** (`—`)
  everywhere they surface — the overview list, the per-site uptime grid, and the
  window selector — instead of a confident ratio computed over only the data
  that happens to exist. The queries for those windows are skipped entirely, so
  each refresh also makes fewer Prometheus calls.
- The **selected-window charts** are clamped to the retained span, so the `1y`
  view shows the ~14 days that actually exist at usable density rather than a
  near-empty strip.
- A small **coverage note** explains the limit on both pages.

The window set includes a `14d` (14 days) figure that sits between `7d` and
`30d`, so a 14-day plan has an honest, fully-labeled summary for its entire
retained span — under `METRICS_RETENTION_DAYS=14`, `14d` is the largest covered
window, and the overview opens on it by default.

Leaving it unset preserves the previous behavior exactly — every window is
queried and reported in full. Set it to match your plan's retention (e.g. `14`)
so the page never claims a confident `100%` over a window the data can't back.

> This is a **server-side** setting (no `NEXT_PUBLIC_` prefix). Set it to `0`,
> a negative number, or leave it blank to mean unlimited.

Mock data honors the same variable, so `MOCK=1 METRICS_RETENTION_DAYS=14`
reproduces the behavior locally without Grafana credentials.

---

## Metric names

The defaults match the **current** Grafana Synthetic Monitoring schema. Some
stacks (especially older ones) expose differently named metrics. Run the
introspection script to see what *your* stack uses:

```bash
node --env-file=.env.local scripts/introspect.mjs
```

If the names differ, override them:

| Variable | Default | Used for |
| --- | --- | --- |
| `SM_METRIC_INFO` | `sm_check_info` | Discovering services / checks |
| `SM_METRIC_SUCCESS_SUM` | `probe_all_success_sum` | Uptime numerator |
| `SM_METRIC_SUCCESS_COUNT` | `probe_all_success_count` | Uptime denominator |
| `SM_METRIC_DURATION_SUM` | `probe_all_duration_seconds_sum` | Response-time numerator |
| `SM_METRIC_DURATION_COUNT` | `probe_all_duration_seconds_count` | Response-time denominator |

> The raw `probe_success` metric is aggregated on Grafana Cloud and cannot be
> queried directly, which is why uptime is computed from the `probe_all_*`
> counters over [`CURRENT_WINDOW`](#current-updown-window).

---

## Grouping by custom label

Large installations often monitor several endpoints for one product family (a
public site, its API, an admin console, an auth endpoint). ProbeView can group
those on the overview into named sections, driven entirely by a Grafana
**custom label** — no service list is maintained in this repo.

| Variable | Default | Description |
| --- | --- | --- |
| `SM_GROUP_LABEL` | unset ⇒ off | Name of the custom label used as the **group** heading (e.g. `product`). |
| `SM_PURPOSE_LABEL` | unset ⇒ off | Name of the custom label shown as a compact **secondary chip** on each row (e.g. `purpose`). |

### How it works

Grafana Synthetic Monitoring [custom labels](https://grafana.com/docs/grafana-cloud/testing/synthetic-monitoring/analyze-results/custom-labels/) are exposed on
`sm_check_info` with a `label_` prefix. Setting `SM_GROUP_LABEL=product` makes
ProbeView read `label_product` off each check during discovery. So a check
configured in Grafana with:

```text
product = PesaCheck
purpose = API
```

renders under a **PesaCheck** section, with a small **API** chip on its row.

- Checks that share a `label_<group>` value appear in one named section. Group
  headings show the **worst** child status as a dot plus an honest impact
  summary — `All 3 operational`, `1 of 3 affected`, or `Status unavailable for
  1 of 3` — so a single failing endpoint never mislabels the whole group as
  down. Every check stays independently clickable with its own history.
- Groups are **collapsible** — expanded by default, with a chevron indicating
  state. A collapsed group keeps its status dot and impact summary visible, so a
  failing endpoint is never hidden. Each visitor's collapsed groups are
  remembered across visits (in `localStorage`, client-side only). Search matches
  the group name, check name, target URL, and purpose, and always expands groups
  with matches.
- The active sort (Name / Uptime / Response) orders **everything** — the rows
  within each group, the groups themselves, and the group names. Groups and
  ungrouped checks are peers, so an ungrouped check can land between two groups.
  A group is positioned by its **leading edge**: the member that sorts first in
  the current direction (its lowest uptime / highest response for the default
  worst-/slowest-first views, the reverse when flipped), which is exactly the
  value of the group's top visible row. Entries with no data sort to the bottom and
  ties break alphabetically.
- Checks with **no value** for the group label render as plain top-level rows,
  interleaved among the group sections by the same sort.
  When **no** check carries the label at all, the overview keeps its original flat list.

Both variables are **server-side only** (no `NEXT_PUBLIC_` prefix): grouping is
resolved on the server and only the resolved group/purpose strings reach the
browser, never the label names. Mock data ships representative grouped and
ungrouped checks, so `MOCK=1 SM_GROUP_LABEL=product SM_PURPOSE_LABEL=purpose`
previews the layout without Grafana credentials.


---

## Quick troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Page shows sample data unexpectedly | One of the three credentials is missing/blank, or `MOCK=1` is set | Check all three are set and non-empty; unset `MOCK`. |
| No services listed (live mode) | `SM_METRIC_INFO` name doesn't match your stack | Run `introspect.mjs`; set `SM_METRIC_INFO`. |
| Services listed but uptime/latency empty | `SM_METRIC_SUCCESS_*` / `SM_METRIC_DURATION_*` names differ | Run `introspect.mjs`; set the relevant `SM_METRIC_*`. |
| `HTTP 401` from Prometheus | Wrong user/token, or token lacks `metrics:read` | Recheck the metrics instance ID and the access-policy scope. |
| `HTTP 404` from Prometheus | `GRAFANA_PROM_URL` missing the `/api/prom` suffix | Append `/api/prom` to the URL. |
| A service flaps up/down | `CURRENT_WINDOW` is shorter than the check interval | Increase `CURRENT_WINDOW`. |
| Groups not showing (live mode) | `SM_GROUP_LABEL` unset, or checks have no value for that custom label | Set `SM_GROUP_LABEL` to a label your checks carry; confirm the label appears as `label_<name>` on `sm_check_info` (run `introspect.mjs`). |

For anything else, run `scripts/introspect.mjs` first — it reproduces the exact
queries the app makes and surfaces most misconfigurations directly.
