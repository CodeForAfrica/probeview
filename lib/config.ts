/**
 * Central configuration, read from environment.
 *
 * The Grafana Cloud credentials are read on the SERVER ONLY (no NEXT_PUBLIC_
 * prefix), so the access token is never shipped to the browser.
 *
 * When the Prometheus URL is not configured (or MOCK=1 is set), the data layer
 * serves representative fixture data instead, so the UI can be developed and
 * verified without secrets.
 */

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

const promUrl = env("GRAFANA_PROM_URL");
const promUser = env("GRAFANA_PROM_USER");
const promToken = env("GRAFANA_PROM_TOKEN");

export const config = {
  /** Base URL incl. `/api/prom` — e.g. https://prometheus-prod-XX.grafana.net/api/prom */
  promUrl,
  /** Numeric metrics instance id (HTTP basic-auth username). */
  promUser,
  /** Access-policy token scoped `metrics:read` (HTTP basic-auth password). */
  promToken,

  /** Serve fixture data when creds are absent or MOCK=1 is set. */
  mock: env("MOCK") === "1" || !promUrl || !promUser || !promToken,

  /**
   * Metric names. Defaults follow the current Grafana Synthetic Monitoring
   * schema; override via env if your stack uses the older bare names.
   */
  metrics: {
    info: env("SM_METRIC_INFO", "sm_check_info"),
    successSum: env("SM_METRIC_SUCCESS_SUM", "probe_all_success_sum"),
    successCount: env("SM_METRIC_SUCCESS_COUNT", "probe_all_success_count"),
    durationSum: env("SM_METRIC_DURATION_SUM", "probe_all_duration_seconds_sum"),
    durationCount: env("SM_METRIC_DURATION_COUNT", "probe_all_duration_seconds_count"),
  },

  /**
   * Window used to decide current up/down. We compute reachability over this
   * window from the probe_all_* counters (the raw probe_success metric is an
   * aggregated metric on Grafana Cloud and can't be queried directly). Should
   * be a small multiple of your check frequency.
   */
  currentWindow: env("CURRENT_WINDOW", "1h"),

  /** Uptime % thresholds that drive the green / amber / red status colors. */
  thresholds: {
    operational: Number(env("UPTIME_OPERATIONAL", "99.9")),
    degraded: Number(env("UPTIME_DEGRADED", "95")),
  },

  /** Cache window (seconds) for Prometheus responses / page revalidation. */
  revalidate: Number(env("REVALIDATE_SECONDS", "60")),

  siteName: env("NEXT_PUBLIC_SITE_NAME", "Code for Africa"),
  tagline: env("NEXT_PUBLIC_SITE_TAGLINE", "Status of our public services"),
} as const;

export type Config = typeof config;
