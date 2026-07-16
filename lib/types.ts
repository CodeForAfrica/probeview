export type Status = "up" | "degraded" | "down" | "unknown";

export type WindowKey = "24h" | "7d" | "30d" | "1y";

export const WINDOWS: { key: WindowKey; label: string; seconds: number }[] = [
  { key: "24h", label: "24 hours", seconds: 86_400 },
  { key: "7d", label: "7 days", seconds: 604_800 },
  { key: "30d", label: "30 days", seconds: 2_592_000 },
  { key: "1y", label: "1 year", seconds: 31_536_000 },
];

export const WINDOW_KEYS = WINDOWS.map((w) => w.key);

/**
 * Is a window fully covered by `retentionDays` of retained metrics? A window
 * longer than what the plan keeps can't be reported honestly. `null`/`undefined`
 * retention means unlimited, so every window is covered. Pure and dependency-free
 * so both the server data layer and Client Components can share it.
 */
export function windowWithinRetention(
  window: WindowKey,
  retentionDays: number | null | undefined,
): boolean {
  if (retentionDays == null) return true;
  const w = WINDOWS.find((x) => x.key === window);
  return w == null || w.seconds <= retentionDays * 86_400;
}

/** A single synthetic check (one monitored target). */
export interface Check {
  id: string;
  name: string;
  /** The probed target, e.g. https://example.org */
  target: string;
  job: string;
  instance: string;
  region?: string;
}

/** A numeric metric keyed by time window (uptime % or avg response ms). */
export type MetricByWindow = Record<WindowKey, number | null>;
export type UptimeByWindow = MetricByWindow;

/** A check plus its current status and summary numbers (overview card). */
export interface CheckStatus extends Check {
  status: Status;
  /** Uptime percentage (0–100) per window. */
  uptime: UptimeByWindow;
  /** Average response time (ms) per window. */
  responseMs: MetricByWindow;
}

/**
 * The overview payload plus the time its data was actually fetched from
 * Grafana. `fetchedAt` is captured inside the data cache, so it reflects
 * metric freshness (the last cache miss), not page render time.
 */
export interface OverviewData {
  checks: CheckStatus[];
  /** Unix seconds at which the underlying Grafana data was fetched. */
  fetchedAt: number;
}

/** One time bucket of the uptime history bar strip. */
export interface UptimeBucket {
  /** Bucket start, unix seconds. */
  t: number;
  /** Uptime fraction 0–1, or null if no data. */
  uptime: number | null;
}

/** One point of the response-time line. */
export interface ResponsePoint {
  t: number;
  ms: number | null;
}

/**
 * Summary response-time figures for a window. Computed at a fixed resolution
 * (independent of the chart's bucket width) so they stay comparable across
 * windows — a longer window's max is always ≥ a shorter window's. See
 * `fetchSiteHistory`. All ms; null when there's no data.
 */
export interface ResponseStats {
  min: number | null;
  avg: number | null;
  max: number | null;
}

/** Everything the per-site history page needs. */
export interface SiteHistory {
  check: Check;
  status: Status;
  uptime: UptimeByWindow;
  responseMs: number | null;
  /** Window the bars / chart below correspond to. */
  window: WindowKey;
  bars: UptimeBucket[];
  response: ResponsePoint[];
  /** Window-consistent min/avg/max latency, independent of bucket width. */
  responseStats: ResponseStats;
}
