import { describe, expect, it } from "vitest";
import { bucketPlan } from "./buckets";
import { WINDOWS, type WindowKey } from "./types";

// A fixed clock on a whole second, plus a sub-second offset to exercise flooring.
const NOW_SEC = 1_700_000_000;
const now = NOW_SEC * 1000 + 789;

describe("bucketPlan", () => {
  it("returns the expected count and step per window", () => {
    expect(bucketPlan("24h", now)).toMatchObject({ count: 48, stepSec: 1800 });
    expect(bucketPlan("7d", now)).toMatchObject({ count: 84, stepSec: 7200 });
    expect(bucketPlan("30d", now)).toMatchObject({ count: 90, stepSec: 28800 });
    expect(bucketPlan("1y", now)).toMatchObject({ count: 90, stepSec: 350400 });
  });

  it("echoes the requested window", () => {
    for (const { key } of WINDOWS) {
      expect(bucketPlan(key, now).window).toBe(key);
    }
  });

  it("floors `now` to whole seconds for endSec", () => {
    expect(bucketPlan("24h", now).endSec).toBe(NOW_SEC);
  });

  it("sets startSec exactly count*step before endSec", () => {
    for (const { key } of WINDOWS) {
      const plan = bucketPlan(key as WindowKey, now);
      expect(plan.startSec).toBe(plan.endSec - plan.stepSec * plan.count);
    }
  });

  it("spans the full window duration for each key", () => {
    // count*step divides each window's duration evenly, so the strip covers it exactly.
    for (const { key, seconds } of WINDOWS) {
      const plan = bucketPlan(key as WindowKey, now);
      expect(plan.endSec - plan.startSec).toBe(seconds);
      expect(plan.stepSec * plan.count).toBe(seconds);
    }
  });

  it("never lets the step drop below the 5-minute floor", () => {
    // Note: every defined window yields a step far above 300s (1800s–350400s),
    // so this asserts the invariant rather than exercising the Math.max floor
    // branch — that branch is effectively dead for the current WINDOWS.
    for (const { key } of WINDOWS) {
      expect(bucketPlan(key as WindowKey, now).stepSec).toBeGreaterThanOrEqual(300);
    }
  });

  it("defaults `now` to the current time when omitted", () => {
    const before = Math.floor(Date.now() / 1000);
    const endSec = bucketPlan("24h").endSec;
    const after = Math.floor(Date.now() / 1000);
    expect(endSec).toBeGreaterThanOrEqual(before);
    expect(endSec).toBeLessThanOrEqual(after);
  });
});
