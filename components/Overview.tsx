"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { fmtMs, fmtPct, STATUS_META } from "@/lib/format";
import {
  type CheckStatus,
  type Status,
  WINDOWS,
  type WindowKey,
  windowWithinRetention,
} from "@/lib/types";
import { CoverageNote } from "./CoverageNote";
import { Chevron, Search } from "./icons";
import { StatusBanner } from "./StatusBanner";

/** Fallback section for checks that carry no group label. */
const OTHER_GROUP = "Other services";

/** localStorage key holding the names of groups the visitor has collapsed. */
const COLLAPSE_KEY = "probeview:collapsed-groups";

/** DOM id of the pre-paint boot <style> injected by app/layout.tsx. */
const BOOT_STYLE_ID = "group-collapse-boot";

// Apply persisted collapse state before the browser paints so client-side
// navigations don't flash groups open. On the server this is a no-op effect
// (layout effects never run there); the boot <style> covers the initial load.
const useBrowserLayoutEffect =
  typeof document !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Window the overview opens on: the usual `30d`, unless retention doesn't cover
 * it — then the largest window that *is* covered, so visitors don't land on a
 * grid of `—`.
 */
function defaultWindow(retentionDays: number | null): WindowKey {
  if (windowWithinRetention("30d", retentionDays)) return "30d";
  return (
    [...WINDOWS]
      .reverse()
      .find((w) => windowWithinRetention(w.key, retentionDays))?.key ??
    WINDOWS[0].key
  );
}

function overallStatus(checks: CheckStatus[]): Status {
  if (checks.some((c) => c.status === "down")) return "down";
  if (checks.some((c) => c.status === "degraded")) return "degraded";
  if (checks.length && checks.every((c) => c.status === "unknown"))
    return "unknown";
  return "up";
}

// Severity order for the group indicator dot: an outage outranks a degradation
// outranks a data gap outranks healthy. `up` is the identity so an all-up group
// stays green.
const STATUS_RANK: Record<Status, number> = {
  down: 3,
  degraded: 2,
  unknown: 1,
  up: 0,
};

/** Worst status among a group's children — drives the group dot color. */
function worstStatus(checks: CheckStatus[]): Status {
  return checks.reduce<Status>(
    (worst, c) =>
      STATUS_RANK[c.status] > STATUS_RANK[worst] ? c.status : worst,
    "up",
  );
}

/**
 * Impact summary for a group, computed over *all* its children so the count
 * stays honest regardless of how search narrows the visible rows. A single
 * affected child never escalates the whole group to "Down" - it reports how
 * many are affected instead.
 */
function groupSummary(checks: CheckStatus[]): string {
  const n = checks.length;
  const affected = checks.filter(
    (c) => c.status === "down" || c.status === "degraded",
  ).length;
  const unavailable = checks.filter((c) => c.status === "unknown").length;
  if (affected > 0) return `${affected} of ${n} affected`;
  if (unavailable > 0) return `Status unavailable for ${unavailable} of ${n}`;
  return `All ${n} operational`;
}

type SortKey = "name" | "uptime" | "response";
type SortDir = "asc" | "desc";

const SORTS: { key: SortKey; label: string; defaultDir: SortDir }[] = [
  { key: "name", label: "Name", defaultDir: "asc" },
  { key: "uptime", label: "Uptime", defaultDir: "asc" }, // worst first
  { key: "response", label: "Response", defaultDir: "desc" }, // slowest first
];

/** Does a check match the (already lowercased) search query? */
function matchesQuery(c: CheckStatus, q: string): boolean {
  return (
    c.name.toLowerCase().includes(q) ||
    c.target.toLowerCase().includes(q) ||
    (c.group?.toLowerCase().includes(q) ?? false) ||
    (c.purpose?.toLowerCase().includes(q) ?? false)
  );
}

/** Apply the selected sort to a list of checks for the active window. */
function sortChecks(
  list: CheckStatus[],
  sort: { key: SortKey; dir: SortDir },
  window: WindowKey,
): CheckStatus[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    if (sort.key === "name") return dir * a.name.localeCompare(b.name);
    const av = sort.key === "uptime" ? a.uptime[window] : a.responseMs[window];
    const bv = sort.key === "uptime" ? b.uptime[window] : b.responseMs[window];
    // Services with no data always sort to the bottom, regardless of direction.
    if (av == null && bv == null) return a.name.localeCompare(b.name);
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av === bv) return a.name.localeCompare(b.name);
    return dir * (av - bv);
  });
}

interface Group {
  name: string;
  /** Rows to render (search-filtered, sorted). */
  checks: CheckStatus[];
  /** Every child of the group, for the honest impact summary/dot. */
  all: CheckStatus[];
}

export function Overview({
  checks,
  updated,
  retentionDays = null,
}: {
  checks: CheckStatus[];
  updated: string;
  /** Plan retention in days; `null` (the default) ⇒ unlimited, every window covered. */
  retentionDays?: number | null;
}) {
  const [window, setWindow] = useState<WindowKey>(() =>
    defaultWindow(retentionDays),
  );
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "name",
    dir: "asc",
  });
  const [query, setQuery] = useState("");
  // Names of collapsed groups. Starts empty (every group expanded) so the first
  // client render matches the server HTML; the persisted state is applied in a
  // layout effect below, before paint. The boot <style> in app/layout.tsx hides
  // collapsed groups for the initial server-rendered paint that precedes it.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  useBrowserLayoutEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed))
        setCollapsed(new Set(parsed.filter((n) => typeof n === "string")));
    } catch {
      // localStorage unavailable or malformed — keep every group expanded.
    }
    setHydrated(true);
  }, []);

  // Once React owns the collapse state, drop the boot <style> so groups the
  // visitor expands this session are no longer force-hidden by it.
  useEffect(() => {
    if (hydrated) document.getElementById(BOOT_STYLE_ID)?.remove();
  }, [hydrated]);

  function toggleGroup(name: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
      } catch {
        // Best-effort persistence; collapse still applies for this view.
      }
      return next;
    });
  }

  const overall = overallStatus(checks);
  const operational = checks.filter((c) => c.status === "up").length;

  // Grouping activates only when at least one check carries a group label; with
  // none, the page keeps its original flat presentation.
  const grouped = useMemo(() => checks.some((c) => c.group), [checks]);
  const q = query.trim().toLowerCase();

  // Flat presentation (no groups anywhere).
  const visible = useMemo(() => {
    const matched = q ? checks.filter((c) => matchesQuery(c, q)) : checks;
    return sortChecks(matched, sort, window);
  }, [checks, q, sort, window]);

  // Grouped presentation. Group order is stable (named groups alphabetical,
  // "Other services" always last); the selected sort applies within each group.
  const groups = useMemo<Group[]>(() => {
    if (!grouped) return [];
    const byName = new Map<string, CheckStatus[]>();
    for (const c of checks) {
      const key = c.group ?? OTHER_GROUP;
      const bucket = byName.get(key);
      if (bucket) bucket.push(c);
      else byName.set(key, [c]);
    }
    const ordered = [...byName.entries()].sort(([a], [b]) => {
      if (a === OTHER_GROUP) return 1;
      if (b === OTHER_GROUP) return -1;
      return a.localeCompare(b);
    });
    const result: Group[] = [];
    for (const [name, all] of ordered) {
      // When the group name itself matches, show the whole group; otherwise
      // show only the children that match the query.
      const shown =
        !q || name.toLowerCase().includes(q)
          ? all
          : all.filter((c) => matchesQuery(c, q));
      if (shown.length === 0) continue;
      result.push({ name, checks: sortChecks(shown, sort, window), all });
    }
    return result;
  }, [grouped, checks, q, sort, window]);

  const visibleCount = grouped
    ? groups.reduce((n, g) => n + g.checks.length, 0)
    : visible.length;

  function onSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: SORTS.find((s) => s.key === key)?.defaultDir ?? "asc" },
    );
  }

  return (
    <div className="space-y-6">
      <StatusBanner
        status={overall}
        subtitle={`${operational}/${checks.length} services operational · updated ${updated}`}
      />

      <CoverageNote retentionDays={retentionDays} />

      {/* Search — its own row so the sort/window controls below stay uncluttered. */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search services by name, URL, or group"
          aria-label="Search services by name, URL, or group"
          className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm placeholder:text-muted focus:border-foreground/30 focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted">
          {query.trim()
            ? `${visibleCount} of ${checks.length} services`
            : "Services"}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Sort control */}
          <div className="inline-flex items-center rounded-lg border border-border bg-surface p-0.5 text-sm">
            {SORTS.map((s) => {
              const active = sort.key === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => onSort(s.key)}
                  aria-label={`Sort by ${s.label}${active ? `, ${sort.dir === "asc" ? "ascending" : "descending"}` : ""}`}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors ${
                    active
                      ? "bg-foreground text-background"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {s.label}
                  {active && (
                    <span aria-hidden>{sort.dir === "asc" ? "↑" : "↓"}</span>
                  )}
                </button>
              );
            })}
          </div>
          {/* Uptime window */}
          <div className="inline-flex rounded-lg border border-border bg-surface p-0.5 text-sm">
            {WINDOWS.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => setWindow(w.key)}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  window === w.key
                    ? "bg-foreground text-background"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {w.key}
              </button>
            ))}
          </div>
        </div>
      </div>

      {grouped ? (
        groups.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface px-5 py-10 text-center text-sm text-muted">
            No services match “{query.trim()}”.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {groups.map((g, gi) => {
              const meta = STATUS_META[worstStatus(g.all)];
              // An active search force-expands every shown group so matches are
              // never hidden behind a collapsed section — search behaves exactly
              // as before. Otherwise the persisted collapse state applies.
              const open = q !== "" || !collapsed.has(g.name);
              const listId = `group-${gi}`;
              return (
                <section
                  key={g.name}
                  className={gi > 0 ? "border-t border-border" : ""}
                  aria-label={g.name}
                  data-group={g.name}
                >
                  <h3>
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.name)}
                      aria-expanded={open}
                      aria-controls={listId}
                      className="flex w-full items-center gap-3 bg-background/60 px-5 py-3 text-left transition-colors hover:bg-background"
                    >
                      <Chevron
                        className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`}
                      />
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {g.name}
                      </span>
                      <span className="shrink-0 text-xs font-normal text-muted">
                        {groupSummary(g.all)}
                      </span>
                    </button>
                  </h3>
                  {open && (
                    <ul
                      id={listId}
                      className="divide-y divide-border border-t border-border"
                    >
                      {g.checks.map((c) => (
                        <CheckRow key={c.id} check={c} window={window} />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-border bg-surface divide-y divide-border">
          {visible.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-muted">
              No services match “{query.trim()}”.
            </li>
          )}
          {visible.map((c) => (
            <CheckRow key={c.id} check={c} window={window} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** One service row — a link to its detail history. */
function CheckRow({
  check: c,
  window,
}: {
  check: CheckStatus;
  window: WindowKey;
}) {
  const meta = STATUS_META[c.status];
  return (
    <li>
      <Link
        href={`/site/${c.id}`}
        className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-background"
      >
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{c.name}</span>
            {c.purpose && (
              <span className="shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] font-medium leading-none text-muted">
                {c.purpose}
              </span>
            )}
          </span>
          <span className="block truncate text-sm text-muted">
            {c.target.replace(/^https?:\/\//, "")}
          </span>
        </span>
        <span className="hidden text-right sm:block">
          <span className="block text-sm font-medium tabular-nums">
            {fmtPct(c.uptime[window])}
          </span>
          <span className="block text-xs text-muted">{window} uptime</span>
        </span>
        <span className="w-24 text-right">
          <span className="block text-sm font-medium tabular-nums">
            {fmtMs(c.responseMs[window])}
          </span>
          <span className="block text-xs text-muted">{window} response</span>
        </span>
      </Link>
    </li>
  );
}
