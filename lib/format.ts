import { config } from "./config";
import type { Status } from "./types";

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** FNV-1a hash of a string as an unsigned 32-bit integer. */
export function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Short, stable, URL-safe hash of a string (FNV-1a, base36). */
function shortHash(s: string): string {
  return fnv1a(s).toString(36);
}

/**
 * Canonical identity string for a check. A check's Grafana identity is the
 * combination of job name + target (instance), so both must key it.
 */
export function checkIdentity(job: string, instance: string): string {
  return `${job} ${instance}`;
}

/** Readable slug base for a check: its job slug (target slug if job is empty). */
function baseCheckId(job: string, instance: string): string {
  return slugify(job) || slugify(instance) || "check";
}

/**
 * Unique, deterministic public id for a check.
 *
 * The id always appends a stable hash
 * of the full identity to the readable slug: `<job-slug>-<hash>`.
 *
 * The hash depends only on this check's own (job, target), so an id never
 * changes because some *other* check was added, removed, or renamed. The slug
 * leads so URLs stay scannable and sort/autocomplete by service name.
 */
export function checkId(job: string, instance: string): string {
  return `${baseCheckId(job, instance)}-${shortHash(checkIdentity(job, instance))}`;
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
  if (uptime24h != null && uptime24h < config.thresholds.degraded)
    return "degraded";
  return "up";
}

export const STATUS_META: Record<
  Status,
  { label: string; color: string; dot: string }
> = {
  up: {
    label: "Operational",
    color: "text-emerald-600",
    dot: "bg-emerald-500",
  },
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
