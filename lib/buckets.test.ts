import { describe, expect, it } from "vitest";
import { bucketPlan, responsePlan } from "./buckets";
import { WINDOWS, type WindowKey } from "./types";

// A fixed clock on a whole second, plus a sub-second offset to exercise flooring.
const NOW_SEC = 1_700_000_000;
const now = NOW_SEC * 1000 + 789;

describe("bucketPlan", () => {
  it("returns the expected count and step per window", () => {
    expect(bucketPlan("24h", now)).toMatchObject({ count: 48, stepSec: 1800 });
    expect(bucketPlan("7d", now)).toMatchObject({ count: 84, stepSec: 7200 });
    expect(bucketPlan("14d", now)).toMatchObject({ count: 84, stepSec: 14400 });
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
      expect(bucketPlan(key as WindowKey, now).stepSec).toBeGreaterThanOrEqual(
        300,
      );
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

describe("bucketPlan with a retention clamp", () => {
  const FOURTEEN_DAYS = 14 * 86_400;

  it("shrinks the span to the clamp while keeping the bar count", () => {
    const full = bucketPlan("1y", now);
    const clamped = bucketPlan("1y", now, FOURTEEN_DAYS);
    // Same number of bars, but they now cover only the retained span.
    expect(clamped.count).toBe(full.count);
    expect(clamped.endSec - clamped.startSec).toBe(FOURTEEN_DAYS);
    expect(clamped.stepSec * clamped.count).toBe(FOURTEEN_DAYS);
    // Denser bars than the unclamped year.
    expect(clamped.stepSec).toBeLessThan(full.stepSec);
  });

  it("is a no-op when the window is already within the clamp", () => {
    // 24h (86400s) is well inside a 14-day clamp.
    expect(bucketPlan("24h", now, FOURTEEN_DAYS)).toEqual(
      bucketPlan("24h", now),
    );
  });
});

describe("responsePlan", () => {
  it("matches bucketPlan when the step is already at or below a day", () => {
    // 24h/7d/14d/30d steps (1800s–28800s) never exceed the 1-day cap.
    for (const key of ["24h", "7d", "14d", "30d"] as WindowKey[]) {
      expect(responsePlan(key, now)).toEqual(bucketPlan(key, now));
    }
  });

  it("caps the 1y step at a day, giving daily buckets across the full year", () => {
    // 90 four-day buckets collapse the line to a few points when history is
    // sparse; daily buckets keep recent data visible.
    const plan = responsePlan("1y", now);
    expect(plan.stepSec).toBe(86_400);
    expect(plan.count).toBe(365);
  });

  it("still spans (about) the full window after capping", () => {
    const plan = responsePlan("1y", now);
    const year = WINDOWS.find((w) => w.key === "1y")!.seconds;
    expect(plan.endSec - plan.startSec).toBe(plan.stepSec * plan.count);
    // 365 whole days vs 365.0-day year — within a day.
    expect(Math.abs(plan.stepSec * plan.count - year)).toBeLessThanOrEqual(
      86_400,
    );
  });

  it("clamps the 1y span to retention, staying under the daily cap", () => {
    const FOURTEEN_DAYS = 14 * 86_400;
    const plan = responsePlan("1y", now, FOURTEEN_DAYS);
    expect(plan.endSec - plan.startSec).toBe(FOURTEEN_DAYS);
    // 14d / 90 ≈ 3.7h buckets — already below the 1-day cap, so no re-cap.
    expect(plan.stepSec).toBeLessThanOrEqual(86_400);
    expect(plan.count).toBe(bucketPlan("1y", now).count);
  });
});
