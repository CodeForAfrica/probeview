export type Status = "up" | "degraded" | "down" | "unknown";

export type WindowKey = "24h" | "7d" | "30d" | "1y";

export const WINDOWS: { key: WindowKey; label: string; seconds: number }[] = [
  { key: "24h", label: "24 hours", seconds: 86_400 },
  { key: "7d", label: "7 days", seconds: 604_800 },
  { key: "30d", label: "30 days", seconds: 2_592_000 },
  { key: "1y", label: "1 year", seconds: 31_536_000 },
];

export const WINDOW_KEYS = WINDOWS.map((w) => w.key);

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
}
