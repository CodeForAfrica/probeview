import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkId } from "./format";
import { getOverview, getSiteHistory, listChecks } from "./synthetics";

// The public id of the "Site A" fixture used across the overview/history tests.
const SITE_A_ID = checkId("Site A", "https://a.org");

// Shared mock surface. `prom.instantQuery` / `prom.rangeQuery` are driven
// per-test via mockImplementation; query strings are matched on the metric
// tokens and range below.
const { mockConfig, mockData, prom, unstableCache } = vi.hoisted(() => ({
  mockConfig: {
    metrics: {
      info: "sm_info",
      successSum: "SUCCESS_SUM",
      successCount: "SUCCESS_COUNT",
      durationSum: "DURATION_SUM",
      durationCount: "DURATION_COUNT",
    },
    mock: false,
    groupLabel: "",
    purposeLabel: "",
    currentWindow: "1h",
    metricsCacheSeconds: 60,
    retentionDays: null as number | null,
    thresholds: { operational: 99.9, degraded: 95 },
  },
  mockData: { mockOverview: vi.fn(), mockSiteHistory: vi.fn() },
  prom: {
    instantQuery: vi.fn(),
    rangeQuery: vi.fn(),
    escapeLabel: vi.fn((s: string) => s),
  },
  // Passthrough that also records the options each accessor caches with, so
  // tests can assert the data-cache revalidate window is wired from config.
  unstableCache: vi.fn((fn: unknown) => fn),
}));

vi.mock("./config", () => ({ config: mockConfig }));
vi.mock("./mock", () => mockData);
vi.mock("./prometheus", () => prom);
// Run the cached function straight through, bypassing Next's cache layer.
vi.mock("next/cache", () => ({ unstable_cache: unstableCache }));

type Sample = { metric: Record<string, string>; value: [number, string] };
const sample = (metric: Record<string, string>, v: string): Sample => ({
  metric,
  value: [0, v],
});

// Drives every overview query for a single check; `current` sets the
// reachability value returned for the short [1h] window.
//
// Routing depends on mockConfig.currentWindow ("1h") being distinct from
// every WINDOW range (24h/7d/14d/30d/1y) — the current query is matched by its
// "[1h]" range before the SUCCESS/DURATION branches. If currentWindow ever
// collides with a window range, the matching here would mis-route.
const wireOverview = (current: string) =>
  prom.instantQuery.mockImplementation((q: string) => {
    if (q === "sm_info")
      return Promise.resolve([
        sample(
          { job: "Site A", instance: "https://a.org", region: "London" },
          "1",
        ),
      ]);
    // The summary stats query a fixed-resolution sub-series, matched first.
    if (q.startsWith("min_over_time"))
      return Promise.resolve([sample({}, "180")]);
    if (q.startsWith("avg_over_time"))
      return Promise.resolve([sample({}, "520")]);
    if (q.startsWith("max_over_time"))
      return Promise.resolve([sample({}, "7560")]);
    if (q.includes("[1h]"))
      return Promise.resolve(
        current === ""
          ? []
          : [sample({ job: "Site A", instance: "https://a.org" }, current)],
      );
    if (q.includes("DURATION"))
      return Promise.resolve([
        sample({ job: "Site A", instance: "https://a.org" }, "240"),
      ]);
    if (q.includes("SUCCESS"))
      return Promise.resolve([
        sample({ job: "Site A", instance: "https://a.org" }, "99.95"),
      ]);
    return Promise.resolve([]);
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig.mock = false;
  mockConfig.retentionDays = null;
  mockConfig.groupLabel = "";
  mockConfig.purposeLabel = "";
});

describe("listChecks", () => {
  it("dedupes by job+instance, falls back to check_name, skips incomplete rows, and sorts by name", async () => {
    prom.instantQuery.mockResolvedValue([
      sample({ job: "Zebra", instance: "https://z.org", region: "NY" }, "1"),
      sample({ job: "Zebra", instance: "https://z.org" }, "1"), // duplicate
      sample({ check_name: "Alpha", instance: "https://a.org" }, "1"), // job via check_name
      sample({ instance: "https://x.org" }, "1"), // no job → skipped
      sample({ job: "Beta" }, "1"), // no instance → skipped
    ]);

    const checks = await listChecks();

    expect(prom.instantQuery).toHaveBeenCalledWith("sm_info");
    expect(checks).toEqual([
      {
        id: expect.stringMatching(/^alpha-[a-z0-9]+$/),
        name: "Alpha",
        target: "https://a.org",
        job: "Alpha",
        instance: "https://a.org",
        region: undefined,
      },
      {
        id: expect.stringMatching(/^zebra-[a-z0-9]+$/),
        name: "Zebra",
        target: "https://z.org",
        job: "Zebra",
        instance: "https://z.org",
        region: "NY",
      },
    ]);
  });

  it("reads group and purpose from the configured custom labels", async () => {
    mockConfig.groupLabel = "product";
    mockConfig.purposeLabel = "purpose";
    prom.instantQuery.mockResolvedValue([
      sample(
        {
          job: "PesaCheck API",
          instance: "https://api.pesacheck.org",
          label_product: "PesaCheck",
          label_purpose: "API",
        },
        "1",
      ),
      // No label values → group/purpose stay unset (falls into "Other services").
      sample({ job: "Solo", instance: "https://solo.example.org" }, "1"),
      // Present but blank → treated as unset, not an empty group.
      sample(
        {
          job: "Blank",
          instance: "https://blank.example.org",
          label_product: "  ",
        },
        "1",
      ),
    ]);

    const checks = await listChecks();
    const byJob = (j: string) => checks.find((c) => c.job === j)!;

    expect(byJob("PesaCheck API").group).toBe("PesaCheck");
    expect(byJob("PesaCheck API").purpose).toBe("API");
    expect(byJob("Solo").group).toBeUndefined();
    expect(byJob("Solo").purpose).toBeUndefined();
    expect(byJob("Blank").group).toBeUndefined();
  });

  it("ignores custom labels when no group label is configured", async () => {
    prom.instantQuery.mockResolvedValue([
      sample(
        {
          job: "PesaCheck API",
          instance: "https://api.pesacheck.org",
          label_product: "PesaCheck",
          label_purpose: "API",
        },
        "1",
      ),
    ]);

    const [check] = await listChecks();
    expect(check.group).toBeUndefined();
    expect(check.purpose).toBeUndefined();
  });

  it("gives every discovered (job, instance) pair a unique, slug-prefixed id", async () => {
    prom.instantQuery.mockResolvedValue([
      sample({ job: "Public API", instance: "https://api.example.org" }, "1"),
      sample({ job: "Public API", instance: "https://api.example.net" }, "1"),
      sample({ job: "Public-API", instance: "https://api.example.io" }, "1"),
      sample({ job: "Solo", instance: "https://solo.example.org" }, "1"),
    ]);

    const checks = await listChecks();
    const ids = checks.map((c) => c.id);

    expect(checks).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);

    expect(checks.find((c) => c.job === "Solo")?.id).toMatch(
      /^solo-[a-z0-9]+$/,
    );

    const colliding = checks.filter((c) => c.job !== "Solo");
    expect(colliding).toHaveLength(3);
    for (const c of colliding) {
      expect(c.id.startsWith("public-api-")).toBe(true);
    }
  });
});

describe("getOverview", () => {
  it("short-circuits to fixture data in mock mode", async () => {
    mockConfig.mock = true;
    const fixture = [{ id: "fixture" }];
    mockData.mockOverview.mockReturnValue(fixture);

    const overview = await getOverview();
    expect(overview.checks).toBe(fixture);
    expect(typeof overview.fetchedAt).toBe("number");
    expect(prom.instantQuery).not.toHaveBeenCalled();
  });

  it("maps per-window uptime and response, deriving an up status", async () => {
    wireOverview("100");

    const { checks, fetchedAt } = await getOverview();
    const [site, ...rest] = checks;

    // Freshness is stamped inside the cached fetch, not at render time.
    expect(typeof fetchedAt).toBe("number");
    expect(rest).toHaveLength(0);
    expect(site).toMatchObject({
      id: SITE_A_ID,
      name: "Site A",
      target: "https://a.org",
      region: "London",
      status: "up",
      uptime: {
        "24h": 99.95,
        "7d": 99.95,
        "14d": 99.95,
        "30d": 99.95,
        "1y": 99.95,
      },
      responseMs: { "24h": 240, "7d": 240, "14d": 240, "30d": 240, "1y": 240 },
    });
  });

  it("derives a down status when current reachability is zero", async () => {
    wireOverview("0");
    const { checks } = await getOverview();
    expect(checks[0].status).toBe("down");
  });

  it("derives an unknown status when current reachability is absent", async () => {
    wireOverview("");
    const { checks } = await getOverview();
    expect(checks[0].status).toBe("unknown");
  });

  it("reports windows beyond retention as insufficient and skips their queries", async () => {
    mockConfig.retentionDays = 14; // covers 24h + 7d + 14d, not 30d/1y
    wireOverview("100");

    const { checks } = await getOverview();
    const [site] = checks;

    // Covered windows keep their figures; the rest are null (render as —).
    expect(site.uptime).toEqual({
      "24h": 99.95,
      "7d": 99.95,
      "14d": 99.95,
      "30d": null,
      "1y": null,
    });
    expect(site.responseMs).toEqual({
      "24h": 240,
      "7d": 240,
      "14d": 240,
      "30d": null,
      "1y": null,
    });

    // The out-of-retention windows were never queried: only the [24h] and [7d]
    // ranges appear (plus the [1h] current-reachability query and discovery).
    const ranges = prom.instantQuery.mock.calls.map((c) => c[0] as string);
    expect(ranges.some((q) => q.includes("[30d]"))).toBe(false);
    expect(ranges.some((q) => q.includes("[1y]"))).toBe(false);
    expect(ranges.some((q) => q.includes("[7d]"))).toBe(true);
  });
});

describe("getSiteHistory", () => {
  it("short-circuits to fixture data in mock mode", async () => {
    mockConfig.mock = true;
    const fixture = { check: { id: "fixture" } };
    mockData.mockSiteHistory.mockReturnValue(fixture);

    expect(await getSiteHistory("anything", "24h")).toBe(fixture);
    expect(prom.instantQuery).not.toHaveBeenCalled();
  });

  it("returns null for an unknown site id", async () => {
    prom.instantQuery.mockResolvedValue([
      sample({ job: "Site A", instance: "https://a.org" }, "1"),
    ]);
    expect(await getSiteHistory("nope", "24h")).toBeNull();
  });

  it("builds clamped bars, response points, and per-window uptime", async () => {
    wireOverview("100");
    // Return readings at the first three grid slots of whatever plan the code
    // requests (start/step come from the real bucket plan), so the assertions
    // don't depend on the wall clock.
    prom.rangeQuery.mockImplementation(
      (q: string, start: number, _end: number, step: number) =>
        Promise.resolve(
          q.includes("DURATION")
            ? [
                {
                  metric: {},
                  values: [
                    [start + step, "240"],
                    [start + 2 * step, "NaN"],
                    [start + 3 * step, "260"],
                  ],
                },
              ]
            : [
                {
                  metric: {},
                  values: [
                    [start + step, "0.5"],
                    [start + 2 * step, "1"],
                    [start + 3 * step, "1.5"],
                  ],
                },
              ],
        ),
    );

    const history = (await getSiteHistory(SITE_A_ID, "24h"))!;

    expect(history.check.id).toBe(SITE_A_ID);
    expect(history.window).toBe("24h");
    expect(history.status).toBe("up");
    expect(history.responseMs).toBe(240);
    expect(history.uptime).toEqual({
      "24h": 99.95,
      "7d": 99.95,
      "14d": 99.95,
      "30d": 99.95,
      "1y": 99.95,
    });
    // Bars span the full 24h grid (48 buckets); the three readings fill the
    // first slots — the 1.5 fraction is clamped to 1 — and the rest are "no data".
    expect(history.bars).toHaveLength(48);
    expect(history.bars.slice(0, 3).map((b) => b.uptime)).toEqual([0.5, 1, 1]);
    expect(history.bars.slice(3).every((b) => b.uptime === null)).toBe(true);
    // Grid timestamps ascend by the plan's step and end at the window's edge.
    expect(history.bars[1].t - history.bars[0].t).toBe(1800);
    // The response line is left as-is (no grid fill); a non-finite reading is null.
    expect(history.response.map((p) => p.ms)).toEqual([240, null, 260]);
  });

  it("derives min/avg/max from a fixed-resolution series, independent of the window's buckets", async () => {
    wireOverview("0");
    prom.rangeQuery.mockResolvedValue([{ metric: {}, values: [[100, "240"]] }]);

    const history = (await getSiteHistory(SITE_A_ID, "7d"))!;

    // The plotted line only reaches 240ms, but the summary reports the true
    // fixed-resolution extremes — so it can't shrink on a wider window.
    expect(history.responseStats).toEqual({ min: 180, avg: 520, max: 7560 });

    // The extremes use a constant 1h resolution over the window (here [7d:1h]),
    // not the chart's per-window bucket — that's what keeps 30d ≥ 7d.
    const queries = prom.instantQuery.mock.calls.map((c) => c[0] as string);
    expect(
      queries.some(
        (q) => q.startsWith("max_over_time") && q.includes("[7d:1h]"),
      ),
    ).toBe(true);
  });

  it("clamps a beyond-retention window and nulls out-of-retention uptimes", async () => {
    mockConfig.retentionDays = 14; // 1y is way beyond retention
    wireOverview("100");
    prom.rangeQuery.mockResolvedValue([{ metric: {}, values: [[100, "240"]] }]);

    const history = (await getSiteHistory(SITE_A_ID, "1y"))!;

    // Only the retained windows carry figures; 30d/1y read as insufficient.
    expect(history.uptime).toEqual({
      "24h": 99.95,
      "7d": 99.95,
      "14d": 99.95,
      "30d": null,
      "1y": null,
    });

    // The uptime strip keeps the 1y bar count but spans only the retained ~14
    // days (89 steps between the first and last bar), so it stays dense.
    const RETAINED = 14 * 86_400;
    const span = history.bars[history.bars.length - 1].t - history.bars[0].t;
    expect(span).toBeLessThan(RETAINED);
    expect(span).toBeGreaterThan(
      RETAINED - (RETAINED / history.bars.length) * 2,
    );

    const queries = prom.instantQuery.mock.calls.map((c) => c[0] as string);
    // Summary stats use the clamped retention span, not the raw 1y window.
    expect(
      queries.some(
        (q) => q.startsWith("max_over_time") && q.includes(`[${RETAINED}s:1h]`),
      ),
    ).toBe(true);
    // The out-of-retention per-window uptime queries are skipped.
    expect(queries.some((q) => q.includes("[30d]"))).toBe(false);
    expect(
      queries.some((q) => q.startsWith("100 *") && q.includes("[1y]")),
    ).toBe(false);
  });
});

describe("data-cache configuration", () => {
  // unstable_cache(fn, keyParts, options) — the options object is the 3rd arg.
  const lastCacheRevalidate = (): unknown => {
    const calls = unstableCache.mock.calls as unknown as unknown[][];
    const options = calls.at(-1)?.[2] as { revalidate?: unknown } | undefined;
    return options?.revalidate;
  };

  it("caches the overview with the configured metrics-cache window", async () => {
    mockConfig.metricsCacheSeconds = 300;
    prom.instantQuery.mockResolvedValue([]);

    await getOverview();

    // Wired from config, not a route-style hardcoded literal.
    expect(lastCacheRevalidate()).toBe(300);
    mockConfig.metricsCacheSeconds = 60;
  });

  it("caches per-site history with the configured metrics-cache window", async () => {
    mockConfig.metricsCacheSeconds = 300;
    prom.instantQuery.mockResolvedValue([]);

    await getSiteHistory("anything", "24h");

    expect(lastCacheRevalidate()).toBe(300);
    mockConfig.metricsCacheSeconds = 60;
  });
});
