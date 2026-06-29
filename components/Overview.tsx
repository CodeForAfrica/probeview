"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { fmtMs, fmtPct, STATUS_META } from "@/lib/format";
import { WINDOWS, type CheckStatus, type Status, type WindowKey } from "@/lib/types";
import { StatusBanner } from "./StatusBanner";

function overallStatus(checks: CheckStatus[]): Status {
  if (checks.some((c) => c.status === "down")) return "down";
  if (checks.some((c) => c.status === "degraded")) return "degraded";
  if (checks.length && checks.every((c) => c.status === "unknown")) return "unknown";
  return "up";
}

type SortKey = "name" | "uptime" | "response";
type SortDir = "asc" | "desc";

const SORTS: { key: SortKey; label: string; defaultDir: SortDir }[] = [
  { key: "name", label: "Name", defaultDir: "asc" },
  { key: "uptime", label: "Uptime", defaultDir: "asc" }, // worst first
  { key: "response", label: "Response", defaultDir: "desc" }, // slowest first
];

export function Overview({ checks, updated }: { checks: CheckStatus[]; updated: string }) {
  const [window, setWindow] = useState<WindowKey>("30d");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "name", dir: "asc" });

  const overall = overallStatus(checks);
  const operational = checks.filter((c) => c.status === "up").length;

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...checks].sort((a, b) => {
      if (sort.key === "name") return dir * a.name.localeCompare(b.name);
      const av = sort.key === "uptime" ? a.uptime[window] : a.responseMs;
      const bv = sort.key === "uptime" ? b.uptime[window] : b.responseMs;
      // Services with no data always sort to the bottom, regardless of direction.
      if (av == null && bv == null) return a.name.localeCompare(b.name);
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av === bv) return a.name.localeCompare(b.name);
      return dir * (av - bv);
    });
  }, [checks, sort, window]);

  function onSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: SORTS.find((s) => s.key === key)!.defaultDir },
    );
  }

  return (
    <div className="space-y-6">
      <StatusBanner
        status={overall}
        subtitle={`${operational}/${checks.length} services operational · updated ${updated}`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted">Services</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Sort control */}
          <div className="inline-flex items-center rounded-lg border border-border bg-surface p-0.5 text-sm">
            {SORTS.map((s) => {
              const active = sort.key === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => onSort(s.key)}
                  aria-label={`Sort by ${s.label}${active ? `, ${sort.dir === "asc" ? "ascending" : "descending"}` : ""}`}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors ${
                    active ? "bg-foreground text-background" : "text-muted hover:text-foreground"
                  }`}
                >
                  {s.label}
                  {active && <span aria-hidden>{sort.dir === "asc" ? "↑" : "↓"}</span>}
                </button>
              );
            })}
          </div>
          {/* Uptime window */}
          <div className="inline-flex rounded-lg border border-border bg-surface p-0.5 text-sm">
            {WINDOWS.map((w) => (
              <button
                key={w.key}
                onClick={() => setWindow(w.key)}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  window === w.key ? "bg-foreground text-background" : "text-muted hover:text-foreground"
                }`}
              >
                {w.key}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ul className="overflow-hidden rounded-2xl border border-border bg-surface divide-y divide-border">
        {sorted.map((c) => {
          const meta = STATUS_META[c.status];
          return (
            <li key={c.id}>
              <Link
                href={`/site/${c.id}`}
                className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-background"
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="block truncate text-sm text-muted">
                    {c.target.replace(/^https?:\/\//, "")}
                  </span>
                </span>
                <span className="hidden text-right sm:block">
                  <span className="block text-sm font-medium tabular-nums">{fmtPct(c.uptime[window])}</span>
                  <span className="block text-xs text-muted">{window} uptime</span>
                </span>
                <span className="w-20 text-right">
                  <span className="block text-sm font-medium tabular-nums">{fmtMs(c.responseMs)}</span>
                  <span className="block text-xs text-muted">response</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
