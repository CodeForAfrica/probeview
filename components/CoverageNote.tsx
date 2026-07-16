"use client";

import { useEffect, useState } from "react";
import { X } from "./icons";

/**
 * A manual dismissal is remembered for a week — long enough that a returning
 * visitor isn't nagged, standard for an informational (non-critical) banner.
 */
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Absent a manual dismissal, the note auto-hides after a short read window so it
 * doesn't linger over the data. This is session-only (not persisted), so a full
 * reload shows it again.
 */
const AUTO_HIDE_MS = 10_000;

const STORAGE_KEY = "probeview:coverage-note-dismissed-until";

/**
 * Explains why long windows read as insufficient (`—`) when the Grafana plan
 * retains fewer days than the window spans. Renders nothing when retention is
 * unlimited. `retentionDays` is resolved server-side (the underlying env var is
 * not `NEXT_PUBLIC_`), so it reaches this Client Component only as a prop.
 *
 * Dismissable two ways: an explicit close (remembered for a week via
 * localStorage) and a soft auto-hide after a few seconds (this view only).
 */
export function CoverageNote({
  retentionDays,
}: {
  retentionDays: number | null;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (retentionDays == null) return;
    // Honor a recent explicit dismissal, otherwise soft-hide after a short read
    // window. Both mount effects are cleaned up on unmount / prop change.
    try {
      const until = Number(localStorage.getItem(STORAGE_KEY));
      if (Number.isFinite(until) && until > Date.now()) {
        setVisible(false);
        return;
      }
    } catch {
      // localStorage unavailable (private mode, etc.) — fall through to auto-hide.
    }
    const timer = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [retentionDays]);

  if (retentionDays == null || !visible) return null;

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now() + DISMISS_MS));
    } catch {
      // Best-effort persistence; the note still hides for this view regardless.
    }
    setVisible(false);
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-sky-300/60 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
      <p className="flex-1">
        Only the last <strong>{retentionDays} days</strong> of monitoring data
        are retained on this plan — longer windows show what's available.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss notice"
        className="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-sky-700/70 transition-colors hover:text-sky-900 dark:text-sky-300/70 dark:hover:text-sky-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
