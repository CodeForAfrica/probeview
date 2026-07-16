import { describe, expect, it } from "vitest";
import { mockOverview, mockSiteHistory } from "./mock";
import { WINDOW_KEYS } from "./types";

const idOf = (name: string): string =>
  mockOverview().find((s) => s.name === name)!.id;

describe("mockOverview", () => {
  it("returns every fixture site", () => {
    const sites = mockOverview();
    expect(sites).toHaveLength(8);
    // Every id is the readable slug plus a stable hash suffix.
    expect(sites.some((s) => s.id.startsWith("pesacheck-"))).toBe(true);
    expect(sites.some((s) => s.id.startsWith("africandrone-"))).toBe(true);
  });

  it("gives every fixture a unique id, even when job slugs collide", () => {
    const ids = mockOverview().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const publicApi = mockOverview().filter((s) => s.name.startsWith("Public"));
    expect(publicApi).toHaveLength(2);
    expect(publicApi[0].id).not.toBe(publicApi[1].id);
    for (const s of publicApi) {
      expect(s.id.startsWith("public-api-")).toBe(true);
      // Each colliding id resolves back to its own check.
      expect(mockSiteHistory(s.id, "24h")?.check.target).toBe(s.target);
    }
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
    const drone = mockOverview().find((s) => s.name === "africanDRONE")!;
    expect(drone.status).toBe("down");
    for (const key of WINDOW_KEYS) {
      expect(drone.responseMs[key]).toBeNull();
    }
  });

  it("reports up fixtures as operational with numeric response times", () => {
    const pesacheck = mockOverview().find((s) => s.name === "PesaCheck")!;
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
    const id = idOf("PesaCheck");
    const h = mockSiteHistory(id, "24h")!;
    expect(h.window).toBe("24h");
    expect(h.check.id).toBe(id);
    // 24h plans 48 buckets; bars and response points line up one-to-one.
    expect(h.bars).toHaveLength(48);
    expect(h.response).toHaveLength(48);
  });

  it("keeps bar uptime fractions within 0–1", () => {
    const h = mockSiteHistory(idOf("PesaCheck"), "7d")!;
    for (const bar of h.bars) {
      expect(bar.uptime).toBeGreaterThanOrEqual(0);
      expect(bar.uptime).toBeLessThanOrEqual(1);
    }
  });

  it("spaces bucket timestamps by the plan step", () => {
    const h = mockSiteHistory(idOf("PesaCheck"), "24h")!;
    const step = h.bars[1].t - h.bars[0].t;
    expect(step).toBe(1800); // 24h step
    expect(h.response.map((p) => p.t)).toEqual(h.bars.map((b) => b.t));
  });

  it("models a current incident on a down site", () => {
    const h = mockSiteHistory(idOf("africanDRONE"), "24h")!;
    expect(h.status).toBe("down");
    expect(h.responseMs).toBeNull();
    // The last two buckets represent the ongoing outage: each is heavily
    // degraded, and a fully-down bucket carries no response sample. bars and
    // response line up by index, so we zip them directly.
    for (let i = h.bars.length - 2; i < h.bars.length; i++) {
      expect(h.bars[i].uptime).toBeLessThanOrEqual(0.3);
      if (h.bars[i].uptime === 0) expect(h.response[i].ms).toBeNull();
    }
  });

  it("produces stable seeded data for the same id and window", () => {
    const id = idOf("PesaCheck");
    const a = mockSiteHistory(id, "30d")!;
    const b = mockSiteHistory(id, "30d")!;
    // Timestamps track the wall clock, but the seeded series must match.
    expect(a.bars.map((x) => x.uptime)).toEqual(b.bars.map((x) => x.uptime));
    expect(a.response.map((x) => x.ms)).toEqual(b.response.map((x) => x.ms));
    expect(a.uptime).toEqual(b.uptime);
  });
});
