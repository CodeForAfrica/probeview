import { describe, expect, it } from "vitest";
import { mockOverview, mockSiteHistory } from "./mock";
import { WINDOW_KEYS } from "./types";

describe("mockOverview", () => {
  it("returns every fixture site", () => {
    const sites = mockOverview();
    expect(sites).toHaveLength(6);
    expect(sites.map((s) => s.id)).toContain("pesacheck");
    expect(sites.map((s) => s.id)).toContain("african-drone");
  });

  it("mirrors name/target into job/instance", () => {
    for (const s of mockOverview()) {
      expect(s.job).toBe(s.name);
      expect(s.instance).toBe(s.target);
    }
  });

  it("populates uptime and response for every window", () => {
    for (const s of mockOverview()) {
      for (const key of WINDOW_KEYS) {
        expect(s.uptime[key]).not.toBeUndefined();
        expect(s.responseMs[key]).not.toBeUndefined();
      }
    }
  });

  it("keeps uptime percentages within the clamped 80–100 range", () => {
    for (const s of mockOverview()) {
      for (const key of WINDOW_KEYS) {
        const u = s.uptime[key]!;
        expect(u).toBeGreaterThanOrEqual(80);
        expect(u).toBeLessThanOrEqual(100);
      }
    }
  });

  it("marks a down fixture down with null response times", () => {
    const drone = mockOverview().find((s) => s.id === "african-drone")!;
    expect(drone.status).toBe("down");
    for (const key of WINDOW_KEYS) {
      expect(drone.responseMs[key]).toBeNull();
    }
  });

  it("reports up fixtures as operational with numeric response times", () => {
    const pesacheck = mockOverview().find((s) => s.id === "pesacheck")!;
    expect(pesacheck.status).toBe("up");
    for (const key of WINDOW_KEYS) {
      expect(typeof pesacheck.responseMs[key]).toBe("number");
    }
  });

  it("is deterministic across calls", () => {
    expect(mockOverview()).toEqual(mockOverview());
  });
});

describe("mockSiteHistory", () => {
  it("returns null for an unknown id", () => {
    expect(mockSiteHistory("does-not-exist", "24h")).toBeNull();
  });

  it("returns history shaped for the requested window", () => {
    const h = mockSiteHistory("pesacheck", "24h")!;
    expect(h.window).toBe("24h");
    expect(h.check.id).toBe("pesacheck");
    // 24h plans 48 buckets; bars and response points line up one-to-one.
    expect(h.bars).toHaveLength(48);
    expect(h.response).toHaveLength(48);
  });

  it("keeps bar uptime fractions within 0–1", () => {
    const h = mockSiteHistory("pesacheck", "7d")!;
    for (const bar of h.bars) {
      expect(bar.uptime).toBeGreaterThanOrEqual(0);
      expect(bar.uptime).toBeLessThanOrEqual(1);
    }
  });

  it("spaces bucket timestamps by the plan step", () => {
    const h = mockSiteHistory("pesacheck", "24h")!;
    const step = h.bars[1].t - h.bars[0].t;
    expect(step).toBe(1800); // 24h step
    expect(h.response.map((p) => p.t)).toEqual(h.bars.map((b) => b.t));
  });

  it("models a current incident on a down site", () => {
    const h = mockSiteHistory("african-drone", "24h")!;
    expect(h.status).toBe("down");
    expect(h.responseMs).toBeNull();
    // The last two buckets represent the ongoing outage: heavily degraded...
    for (const bar of h.bars.slice(-2)) {
      expect(bar.uptime).toBeLessThanOrEqual(0.3);
    }
    // ...and a fully-down bucket carries no response sample.
    for (const point of h.response.slice(-2)) {
      const bar = h.bars[h.response.indexOf(point)];
      if (bar.uptime === 0) expect(point.ms).toBeNull();
    }
  });

  it("produces stable seeded data for the same id and window", () => {
    const a = mockSiteHistory("pesacheck", "30d")!;
    const b = mockSiteHistory("pesacheck", "30d")!;
    // Timestamps track the wall clock, but the seeded series must match.
    expect(a.bars.map((x) => x.uptime)).toEqual(b.bars.map((x) => x.uptime));
    expect(a.response.map((x) => x.ms)).toEqual(b.response.map((x) => x.ms));
    expect(a.uptime).toEqual(b.uptime);
  });
});
