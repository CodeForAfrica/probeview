import { describe, expect, it } from "vitest";
import { windowWithinRetention } from "./types";

describe("windowWithinRetention", () => {
  it("treats null/undefined retention as unlimited — every window covered", () => {
    for (const days of [null, undefined] as const) {
      expect(windowWithinRetention("24h", days)).toBe(true);
      expect(windowWithinRetention("7d", days)).toBe(true);
      expect(windowWithinRetention("14d", days)).toBe(true);
      expect(windowWithinRetention("30d", days)).toBe(true);
      expect(windowWithinRetention("1y", days)).toBe(true);
    }
  });

  it("covers windows up to and including the retained span", () => {
    // 14 days covers 24h, 7d and 14d, but not 30d or 1y.
    expect(windowWithinRetention("24h", 14)).toBe(true);
    expect(windowWithinRetention("7d", 14)).toBe(true);
    expect(windowWithinRetention("14d", 14)).toBe(true);
    expect(windowWithinRetention("30d", 14)).toBe(false);
    expect(windowWithinRetention("1y", 14)).toBe(false);
  });

  it("includes a window whose span exactly equals retention", () => {
    // 7d retention exactly covers the 7d window.
    expect(windowWithinRetention("7d", 7)).toBe(true);
    expect(windowWithinRetention("14d", 14)).toBe(true);
    expect(windowWithinRetention("30d", 30)).toBe(true);
  });
});
