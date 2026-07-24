import { describe, expect, it } from "vitest";
import { defaultWindow, windowFromParam, windowWithinRetention } from "./types";

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

describe("defaultWindow", () => {
  it("opens on 30d when retention covers it (or is unlimited)", () => {
    for (const days of [null, undefined, 30, 365] as const) {
      expect(defaultWindow(days)).toBe("30d");
    }
  });

  it("falls back to the largest covered window when 30d is out of reach", () => {
    // Free-plan retention (14 days): 14d is the largest window fully covered.
    expect(defaultWindow(14)).toBe("14d");
    expect(defaultWindow(7)).toBe("7d");
    expect(defaultWindow(1)).toBe("24h");
  });

  it("never returns nothing, even below the shortest window", () => {
    // Retention shorter than 24h still yields a window rather than undefined.
    expect(defaultWindow(0.5)).toBe("24h");
  });
});

describe("windowFromParam", () => {
  it("keeps a recognized window", () => {
    expect(windowFromParam("7d", 14)).toBe("7d");
  });

  it("uses the retention-aware default for missing or unknown windows", () => {
    expect(windowFromParam(undefined, null)).toBe("30d");
    expect(windowFromParam("unknown", 14)).toBe("14d");
  });

  it("rejects repeated window parameters as ambiguous", () => {
    expect(windowFromParam(["7d", "30d"], 14)).toBe("14d");
  });
});
