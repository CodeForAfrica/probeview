import { beforeEach, describe, expect, it, vi } from "vitest";
import { WINDOW_KEYS } from "./types";

// mock.ts (and format.ts, which it pulls in) read `config`, so stub it with a
// retention of 14 days to exercise the honest-coverage path without real env.
const { mockConfig } = vi.hoisted(() => ({
  mockConfig: {
    retentionDays: 14 as number | null,
    thresholds: { operational: 99.9, degraded: 95 },
  },
}));
vi.mock("./config", () => ({ config: mockConfig }));

import { mockOverview, mockSiteHistory } from "./mock";

const idOf = (name: string): string =>
  mockOverview().find((s) => s.name === name)!.id;

beforeEach(() => {
  mockConfig.retentionDays = 14;
});

describe("mock data honors METRICS_RETENTION_DAYS", () => {
  it("nulls overview figures for windows beyond retention", () => {
    const site = mockOverview().find((s) => s.name === "PesaCheck")!;
    // 14 days covers 24h + 7d only.
    expect(typeof site.uptime["24h"]).toBe("number");
    expect(typeof site.uptime["7d"]).toBe("number");
    expect(site.uptime["30d"]).toBeNull();
    expect(site.uptime["1y"]).toBeNull();
    expect(typeof site.responseMs["7d"]).toBe("number");
    expect(site.responseMs["30d"]).toBeNull();
    expect(site.responseMs["1y"]).toBeNull();
  });

  it("clamps a beyond-retention history strip to the retained span", () => {
    const h = mockSiteHistory(idOf("PesaCheck"), "1y")!;
    // Same 1y bar count, but the span is the retained ~14 days, not a year.
    const span = h.bars[h.bars.length - 1].t - h.bars[0].t;
    expect(span).toBeLessThan(20 * 86_400);
    // Per-window uptime mirrors the overview: 30d/1y insufficient.
    expect(h.uptime["30d"]).toBeNull();
    expect(h.uptime["1y"]).toBeNull();
  });

  it("reverts to full coverage when retention is unlimited", () => {
    mockConfig.retentionDays = null;
    const site = mockOverview().find((s) => s.name === "PesaCheck")!;
    for (const key of WINDOW_KEYS) {
      expect(site.uptime[key]).not.toBeNull();
    }
  });
});
