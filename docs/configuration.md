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

### `REVALIDATE_SECONDS`

- **Default:** `60`
- Controls two things at once: how long Prometheus responses are cached
  server-side, and the ISR page-revalidation window. Higher values mean fewer
  Prometheus queries (cheaper, but staler data); lower values mean fresher data
  at higher query cost. `60` is a good balance for most public pages.

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

## Quick troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Page shows sample data unexpectedly | One of the three credentials is missing/blank, or `MOCK=1` is set | Check all three are set and non-empty; unset `MOCK`. |
| No services listed (live mode) | `SM_METRIC_INFO` name doesn't match your stack | Run `introspect.mjs`; set `SM_METRIC_INFO`. |
| Services listed but uptime/latency empty | `SM_METRIC_SUCCESS_*` / `SM_METRIC_DURATION_*` names differ | Run `introspect.mjs`; set the relevant `SM_METRIC_*`. |
| `HTTP 401` from Prometheus | Wrong user/token, or token lacks `metrics:read` | Recheck the metrics instance ID and the access-policy scope. |
| `HTTP 404` from Prometheus | `GRAFANA_PROM_URL` missing the `/api/prom` suffix | Append `/api/prom` to the URL. |
| A service flaps up/down | `CURRENT_WINDOW` is shorter than the check interval | Increase `CURRENT_WINDOW`. |

For anything else, run `scripts/introspect.mjs` first — it reproduces the exact
queries the app makes and surfaces most misconfigurations directly.
