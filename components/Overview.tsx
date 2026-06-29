"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtMs, fmtPct, STATUS_META } from "@/lib/format";
import { WINDOWS, type CheckStatus, type Status, type WindowKey } from "@/lib/types";
import { StatusBanner } from "./StatusBanner";

function overallStatus(checks: CheckStatus[]): Status {
  if (checks.some((c) => c.status === "down")) return "down";
  if (checks.some((c) => c.status === "degraded")) return "degraded";
  if (checks.length && checks.every((c) => c.status === "unknown")) return "unknown";
  return "up";
}

export function Overview({ checks, updated }: { checks: CheckStatus[]; updated: string }) {
  const [window, setWindow] = useState<WindowKey>("30d");
  const overall = overallStatus(checks);
  const operational = checks.filter((c) => c.status === "up").length;

  return (
    <div className="space-y-6">
      <StatusBanner
        status={overall}
        subtitle={`${operational}/${checks.length} services operational · updated ${updated}`}
      />

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted">Services</h2>
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

      <ul className="overflow-hidden rounded-2xl border border-border bg-surface divide-y divide-border">
        {checks.map((c) => {
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
