# Code for Africa — Status Page

A public status page (Upptime-style) backed by **Grafana Synthetic Monitoring**.
It shows, per monitored service: current status, uptime % across 24h / 7d / 30d /
1y windows, an uptime history bar strip, and a response-time chart — plus a
per-service detail view at `/site/<id>`.

There is **no incidents feature** — this is purely the live uptime/latency view.

## How it works

Grafana Synthetics publishes probe results as Prometheus metrics into Grafana
Cloud (Mimir). This app's **Server Components** query the Grafana Cloud Prometheus
HTTP API directly (`lib/synthetics.ts` → `lib/prometheus.ts`), compute uptime and
response time, and pass plain data to presentational components. The access token
lives only on the server.

- Services are **discovered dynamically** from `sm_check_info` — nothing is hardcoded.
- Charts are **hand-rolled SVG** (zero chart dependencies).
- Pages use ISR (`export const revalidate = 60`) and the Prometheus client caches
  responses, so the public page is cheap to serve.

If credentials are absent (or `MOCK=1`), the app serves **representative sample
data** so you can develop and preview without secrets.

## Setup

1. Install deps: `pnpm install`
2. Copy env and fill in your Grafana Cloud details:
   ```bash
   cp .env.example .env.local
   ```
   From **Grafana Cloud → your stack → Prometheus → Details**, grab:
   - `GRAFANA_PROM_URL` — the query URL **including** `/api/prom`
     (e.g. `https://prometheus-prod-24-prod-eu-west-2.grafana.net/api/prom`)
   - `GRAFANA_PROM_USER` — the numeric **metrics instance ID** (basic-auth user)
   - `GRAFANA_PROM_TOKEN` — an **Access Policy token** scoped `metrics:read`
     (Grafana Cloud → Access Policies → create policy with `metrics:read`, then a token)

3. **Confirm the metric schema on your stack** (recommended before relying on live data):
   ```bash
   node --env-file=.env.local scripts/introspect.mjs
   ```
   It prints which metric names exist and lists your checks. If the names differ
   from the defaults, set the `SM_METRIC_*` overrides in `.env.local`.

## Run

```bash
pnpm dev         # http://localhost:3000
pnpm build && pnpm start
```

## Deploy

Deploys cleanly to Vercel (or any Node host). Set the same env vars
(`GRAFANA_PROM_URL`, `GRAFANA_PROM_USER`, `GRAFANA_PROM_TOKEN`, optional overrides)
in the host's environment. Do **not** commit `.env.local`.
