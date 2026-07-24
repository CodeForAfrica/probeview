# ProbeView

[![CI](https://github.com/CodeForAfrica/probeview/actions/workflows/ci.yml/badge.svg)](https://github.com/CodeForAfrica/probeview/actions/workflows/ci.yml)

<table width="100%">
  <tr>
    <td align="left">
      <img width="100%" height="907" alt="image" src="https://github.com/user-attachments/assets/f4f0f93f-9e97-4ad4-935e-4144e29a08ac" />
      Homepage
    </td>
    <td align="right">
      <img width="100%" height="909" alt="image" src="https://github.com/user-attachments/assets/dc158009-7513-4b8a-8f33-4252ea80696c" />
      Detail View
    </td>
  </tr>
</table>

A public, self-hostable **status page** for your services — backed entirely by
**Grafana Synthetic Monitoring**. ProbeView shows, for each monitored service:
current up/down status, uptime % across 24h / 7d / 30d / 1y windows, an uptime
history bar strip, and a response-time chart, with a per-service detail view at
`/site/<id>`.

It is **configurable by environment variables alone** — no code changes needed
to point it at your own Grafana stack, rename it, or re-brand it. Services are
discovered automatically from your synthetic checks, so there is nothing to
hardcode and nothing to keep in sync.

> Originally built for [Code for Africa](https://codeforafrica.org), open-sourced
> for anyone to use. Released under the [GPLv3](LICENSE).

---

## Why this exists

Most status pages need you to maintain a list of services, run a separate
uptime checker, and store history somewhere. If you are *already* using Grafana
Synthetic Monitoring, all of that data already exists. This app is a thin,
read-only public view over it:

- **Zero data to manage** — checks come from `sm_check_info`, history comes from
  the probe metrics. Add a check in Grafana, it appears here.
- **No database, no cron, no background workers** — it queries the Grafana Cloud
  Prometheus API at request time and caches the result.
- **No secrets in the browser** — the access token is read only on the server.
- **Cheap to host** — pages use ISR and a server-side cache, so traffic does not
  translate into Prometheus queries one-to-one.

There is intentionally **no incidents / status-history-of-outages feature** —
this is purely the live uptime and latency view.

## What it looks like

| Page | Route | Shows |
| --- | --- | --- |
| Overview | `/` | All services, current status, uptime across windows, search |
| Service detail | `/site/<id>` | One service: uptime bars + response-time chart |

> **Tip:** Want to see the UI before wiring up Grafana? It ships with realistic
> sample data. Just run `pnpm install && pnpm dev` — see [Preview without
> credentials](#preview-without-credentials).

---

## Quick start

### Prerequisites

- **Node.js 24+** and **[pnpm](https://pnpm.io) 11+** (`corepack enable` will
  give you the right pnpm version automatically).
- A **Grafana Cloud** stack with **Synthetic Monitoring** enabled and at least
  one check running. *(Optional for previewing — see below.)*

### 1. Install

```bash
git clone <your-fork-url> probeview
cd probeview
pnpm install
```

### 2. Configure

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in your Grafana Cloud Prometheus details. From
**Grafana Cloud → your stack → Prometheus → Details** (or **Administration →
Users and access → Cloud access policies**):

| Variable | Where to find it |
| --- | --- |
| `GRAFANA_PROM_URL` | The **query URL**, *including* the `/api/prom` suffix — e.g. `https://prometheus-prod-24-prod-eu-west-2.grafana.net/api/prom` |
| `GRAFANA_PROM_USER` | The numeric **metrics instance ID** (used as the basic-auth username) |
| `GRAFANA_PROM_TOKEN` | An **Access Policy token** scoped `metrics:read` (create the policy, then a token under it) |

Every other setting is optional and has a sensible default. See the full
[**Configuration reference**](docs/configuration.md) for branding, thresholds,
caching, and metric-name overrides.

### 3. Verify your stack (recommended)

Different Grafana stacks can expose slightly different metric names. This script
queries *your* stack and tells you exactly what it found — run it before relying
on live data:

```bash
node --env-file=.env.local scripts/introspect.mjs
```

It lists which metric names exist, shows your discovered checks, and runs the
exact queries the app uses. If the names differ from the defaults, set the
`SM_METRIC_*` overrides (see [Configuration → Metric names](docs/configuration.md#metric-names)).

### 4. Run

```bash
pnpm dev                 # http://localhost:3000
# or, production build:
pnpm build && pnpm start
```

### Preview without credentials

If the Grafana variables are absent — or you set `MOCK=1` — the app serves
**representative sample data** instead of hitting Grafana. This is ideal for
trying it out, doing design work, or running the UI in CI. No secrets required:

```bash
pnpm dev    # with no .env.local, you get the sample dashboard
```

---

## Configuration

All configuration is via environment variables, read once in
[`lib/config.ts`](lib/config.ts). The table below is a summary; the
[**full reference**](docs/configuration.md) documents every option, its default,
and when to change it.

| Variable | Default | Purpose |
| --- | --- | --- |
| `GRAFANA_PROM_URL` | — | Prometheus query base URL (incl. `/api/prom`) |
| `GRAFANA_PROM_USER` | — | Metrics instance ID (basic-auth user) |
| `GRAFANA_PROM_TOKEN` | — | Access policy token, `metrics:read` |
| `MOCK` | unset | Set to `1` to force sample data |
| `NEXT_PUBLIC_SITE_NAME` | `Code for Africa` | Name shown in the header and title |
| `NEXT_PUBLIC_SITE_TAGLINE` | `Status of our public services` | Sub-heading text |
| `UPTIME_OPERATIONAL` | `99.9` | Uptime % at/above which a service is green |
| `UPTIME_DEGRADED` | `95` | Uptime % at/above which a service is amber (red below) |
| `CURRENT_WINDOW` | `1h` | Window used to decide current up/down |
| `METRICS_CACHE_SECONDS` | `60` | Metrics-cache window (seconds) for Grafana queries; see note below |
| `METRICS_RETENTION_DAYS` | unset | Metrics retention in days; longer windows show insufficient coverage and charts clamp to retained data |
| `SM_GROUP_LABEL` | unset | Group the overview by this Grafana custom label (read from `label_<name>`); unset ⇒ flat list |
| `SM_PURPOSE_LABEL` | unset | Optional secondary label shown as a compact chip on each row (e.g. `API`) |
| `SM_METRIC_*` | SM schema defaults | Override metric names if your stack differs |

> ⚠️ Anything prefixed `NEXT_PUBLIC_` is shipped to the browser. The Grafana
> credentials deliberately have **no** such prefix and stay server-side. Never
> commit `.env.local`.

---

## Deploy

The app is a standard Next.js application and deploys cleanly to **Vercel** or
any Node host.

1. Set the same environment variables (`GRAFANA_PROM_URL`, `GRAFANA_PROM_USER`,
   `GRAFANA_PROM_TOKEN`, plus any optional overrides) in your host's environment
   — **not** in a committed file.
2. Build command: `pnpm build`. Start command: `pnpm start`.

On Vercel, add the variables under **Project → Settings → Environment
Variables** and deploy. No other configuration is required.

---

## How it works

Grafana Synthetics publishes probe results as Prometheus metrics into Grafana
Cloud (Mimir). This app's **Server Components** query the Grafana Cloud
Prometheus HTTP API directly, compute uptime and response time, and pass plain
data to presentational components.

```
Grafana Synthetics ──► Prometheus (Mimir) ──► lib/prometheus.ts ──► lib/synthetics.ts ──► Server Components ──► UI
        (probes)            (metrics)            (HTTP client,         (compute uptime,        (page.tsx,
                                                  cached)               status, latency)        /site/[id])
```

- **`lib/prometheus.ts`** — minimal, cached HTTP client for the Prometheus query API.
- **`lib/synthetics.ts`** — discovers services and computes uptime / status / latency.
- **`lib/config.ts`** — all environment-driven configuration.
- **`lib/mock.ts`** — the sample-data fallback.
- **`components/`** — presentational UI, including **hand-rolled SVG charts**
  (zero charting dependencies).

Design notes:

- Services are **discovered dynamically** from `sm_check_info` — nothing is hardcoded.
- The overview can **group checks** by a Grafana [custom label](https://grafana.com/docs/grafana-cloud/testing/synthetic-monitoring/analyze-results/custom-labels/)
  (`SM_GROUP_LABEL`) — e.g. all endpoints of one product family under one
  heading — with an optional per-row purpose chip (`SM_PURPOSE_LABEL`). Grouping
  is a projection of Grafana labels, not a second inventory, so it never drifts
  from discovered checks; unset ⇒ the flat list is unchanged. See
  [`docs/configuration.md`](docs/configuration.md#grouping-by-custom-label).

- The Prometheus client and data layer cache responses for `METRICS_CACHE_SECONDS`,
  so the public page is cheap to serve under load and the `updated` timestamp
  reflects when Grafana was last queried. `METRICS_CACHE_SECONDS` sets **how often
  Grafana is queried**, not the route ISR interval — Next requires the latter to
  be a static literal, so the overview route uses a fixed `revalidate` (60s) and
  the detail route renders on demand. Because the overview HTML only regenerates
  on that ISR interval, effective `/` freshness is `max(revalidate,
  METRICS_CACHE_SECONDS)`; setting the cache below 60s only speeds up the detail
  route. See
  [`docs/configuration.md`](docs/configuration.md#metrics_cache_seconds).

For a deeper walk-through, see [`docs/architecture.md`](docs/architecture.md).

---

## Development

```bash
pnpm dev              # dev server with sample data (no creds needed)
pnpm check            # format & lint with Biome (autofix)
pnpm test             # unit tests (Vitest)
pnpm test:watch       # unit tests in watch mode
pnpm test:coverage    # unit tests with coverage
pnpm test:types       # type-check including tests
pnpm test:e2e         # Playwright end-to-end tests
pnpm build            # production build (type-checked)
```

---

## Contributing

Contributions are welcome! Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) for
how to set up your environment, run the checks, and open a pull request, and our
[Code of Conduct](CODE_OF_CONDUCT.md).

## License

Licensed under the **GNU General Public License v3.0** — see [`LICENSE`](LICENSE).
You are free to use, study, share, and modify this software, provided derivative
works are released under the same license.
