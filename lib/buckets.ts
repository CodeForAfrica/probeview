import { WINDOWS, type WindowKey } from "./types";

const BAR_COUNT: Record<WindowKey, number> = {
  "24h": 48,
  "7d": 84,
  "30d": 90,
  "1y": 90,
};

const MIN_STEP_SECONDS = 300; // 5 min — keeps rate() windows above check frequency

export interface BucketPlan {
  window: WindowKey;
  count: number;
  stepSec: number;
  startSec: number;
  endSec: number;
}

/** Decide how many buckets / what step a window's history strip uses. */
export function bucketPlan(window: WindowKey, now = Date.now()): BucketPlan {
  const seconds = WINDOWS.find((w) => w.key === window)!.seconds;
  const count = BAR_COUNT[window];
  const stepSec = Math.max(MIN_STEP_SECONDS, Math.round(seconds / count));
  const endSec = Math.floor(now / 1000);
  const startSec = endSec - stepSec * count;
  return { window, count, stepSec, startSec, endSec };
}
