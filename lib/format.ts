import { config } from "./config";
import type { Status } from "./types";

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Format an uptime percentage (0–100). */
export function fmtPct(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 100) return "100%";
  // Show more precision near the top end, like Upptime.
  const decimals = n >= 99.99 ? 3 : n >= 99 ? 2 : 1;
  return `${n.toFixed(decimals)}%`;
}

export function fmtMs(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(2)} s`;
  return `${Math.round(n)} ms`;
}

/** Derive a status color/label from current up state + 24h uptime. */
export function deriveStatus(
  currentlyUp: boolean | null,
  uptime24h: number | null,
): Status {
  if (currentlyUp == null) return "unknown";
  if (!currentlyUp) return "down";
  if (uptime24h != null && uptime24h < config.thresholds.degraded) return "degraded";
  return "up";
}

export const STATUS_META: Record<
  Status,
  { label: string; color: string; dot: string }
> = {
  up: { label: "Operational", color: "text-emerald-600", dot: "bg-emerald-500" },
  degraded: { label: "Degraded", color: "text-amber-600", dot: "bg-amber-500" },
  down: { label: "Down", color: "text-rose-600", dot: "bg-rose-500" },
  unknown: { label: "No data", color: "text-zinc-400", dot: "bg-zinc-400" },
};

/** Color for an uptime bar given its fraction (0–1). */
export function barColor(uptime: number | null): string {
  if (uptime == null) return "var(--bar-empty)";
  const pct = uptime * 100;
  if (pct >= config.thresholds.operational) return "var(--bar-up)";
  if (pct >= config.thresholds.degraded) return "var(--bar-degraded)";
  return "var(--bar-down)";
}

export function fmtRelative(unixSeconds: number, now = Date.now()): string {
  const diff = Math.max(0, now - unixSeconds * 1000);
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}
