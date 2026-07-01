import { WINDOWS, type WindowKey } from "./types";

const BAR_COUNT: Record<WindowKey, number> = {
  "24h": 48,
  "7d": 84,
  "30d": 90,
  "1y": 90,
};

const MIN_STEP_SECONDS = 300; // 5 min — keeps rate() windows above check frequency

/**
 * Upper bound on the response-line step. The uptime strip wants a fixed, modest
 * bar count, which makes long-window buckets very wide (the 1y strip is ~4-day
 * buckets). Prometheus only returns a point where a bucket has data, so with
 * sparse history those wide buckets collapse the line to a handful of points
 * near the present — the 1y view ends up showing *less* range than 30d. Capping
 * the line's step at one day keeps recent history visible at usable resolution.
 */
const MAX_RESPONSE_STEP_SECONDS = 86_400; // 1 day

export interface BucketPlan {
  window: WindowKey;
  count: number;
  stepSec: number;
  startSec: number;
  endSec: number;
}

/** Decide how many buckets / what step a window's history strip uses. */
export function bucketPlan(window: WindowKey, now = Date.now()): BucketPlan {
  const seconds =
    WINDOWS.find((w) => w.key === window)?.seconds ?? WINDOWS[0].seconds;
  const count = BAR_COUNT[window];
  const stepSec = Math.max(MIN_STEP_SECONDS, Math.round(seconds / count));
  const endSec = Math.floor(now / 1000);
  const startSec = endSec - stepSec * count;
  return { window, count, stepSec, startSec, endSec };
}

/**
 * Bucketing for the response-time line. Matches `bucketPlan` for short windows
 * but caps the step at one day, so long windows resolve recent data instead of
 * collapsing to a few far-apart points. Independent of the uptime strip, which
 * keeps its fixed (coarser) bar count.
 */
export function responsePlan(window: WindowKey, now = Date.now()): BucketPlan {
  const base = bucketPlan(window, now);
  if (base.stepSec <= MAX_RESPONSE_STEP_SECONDS) return base;
  const stepSec = MAX_RESPONSE_STEP_SECONDS;
  const count = Math.round((base.stepSec * base.count) / stepSec);
  return {
    window,
    count,
    stepSec,
    endSec: base.endSec,
    startSec: base.endSec - stepSec * count,
  };
}
