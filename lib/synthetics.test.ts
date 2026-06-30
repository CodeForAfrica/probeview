import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOverview, getSiteHistory, listChecks } from "./synthetics";

// Shared mock surface. `prom.instantQuery` / `prom.rangeQuery` are driven
// per-test via mockImplementation; query strings are matched on the metric
// tokens and range below.
const { mockConfig, mockData, prom } = vi.hoisted(() => ({
  mockConfig: {
    metrics: {
      info: "sm_info",
      successSum: "SUCCESS_SUM",
      successCount: "SUCCESS_COUNT",
      durationSum: "DURATION_SUM",
      durationCount: "DURATION_COUNT",
    },
    mock: false,
    currentWindow: "1h",
    revalidate: 60,
    thresholds: { operational: 99.9, degraded: 95 },
  },
  mockData: { mockOverview: vi.fn(), mockSiteHistory: vi.fn() },
  prom: {
    instantQuery: vi.fn(),
    rangeQuery: vi.fn(),
    escapeLabel: vi.fn((s: string) => s),
  },
}));

vi.mock("./config", () => ({ config: mockConfig }));
vi.mock("./mock", () => mockData);
vi.mock("./prometheus", () => prom);
// Run the cached function straight through, bypassing Next's cache layer.
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));

type Sample = { metric: Record<string, string>; value: [number, string] };
const sample = (metric: Record<string, string>, v: string): Sample => ({
  metric,
  value: [0, v],
});

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig.mock = false;
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
        id: "alpha",
        name: "Alpha",
        target: "https://a.org",
        job: "Alpha",
        instance: "https://a.org",
        region: undefined,
      },
      {
        id: "zebra",
        name: "Zebra",
        target: "https://z.org",
        job: "Zebra",
        instance: "https://z.org",
        region: "NY",
      },
    ]);
  });
});

describe("getOverview", () => {
  it("short-circuits to fixture data in mock mode", async () => {
    mockConfig.mock = true;
    const fixture = [{ id: "fixture" }];
    mockData.mockOverview.mockReturnValue(fixture);

    expect(await getOverview()).toBe(fixture);
    expect(prom.instantQuery).not.toHaveBeenCalled();
  });

  // Drives every overview query for a single check; `current` sets the
  // reachability value returned for the short [1h] window.
  const wireOverview = (current: string) =>
    prom.instantQuery.mockImplementation((q: string) => {
      if (q === "sm_info")
        return Promise.resolve([
          sample(
            { job: "Site A", instance: "https://a.org", region: "London" },
            "1",
          ),
        ]);
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

  it("maps per-window uptime and response, deriving an up status", async () => {
    wireOverview("100");

    const [site, ...rest] = await getOverview();

    expect(rest).toHaveLength(0);
    expect(site).toMatchObject({
      id: "site-a",
      name: "Site A",
      target: "https://a.org",
      region: "London",
      status: "up",
      uptime: { "24h": 99.95, "7d": 99.95, "30d": 99.95, "1y": 99.95 },
      responseMs: { "24h": 240, "7d": 240, "30d": 240, "1y": 240 },
    });
  });

  it("derives a down status when current reachability is zero", async () => {
    wireOverview("0");
    const [site] = await getOverview();
    expect(site.status).toBe("down");
  });

  it("derives an unknown status when current reachability is absent", async () => {
    wireOverview("");
    const [site] = await getOverview();
    expect(site.status).toBe("unknown");
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
    prom.instantQuery.mockImplementation((q: string) => {
      if (q === "sm_info")
        return Promise.resolve([
          sample(
            { job: "Site A", instance: "https://a.org", region: "London" },
            "1",
          ),
        ]);
      if (q.includes("[1h]"))
        return Promise.resolve([sample({}, "100")]); // current → up
      if (q.includes("DURATION"))
        return Promise.resolve([sample({}, "240")]); // respNow
      if (q.includes("SUCCESS"))
        return Promise.resolve([sample({}, "99.9")]); // per-window uptime
      return Promise.resolve([]);
    });
    prom.rangeQuery.mockImplementation((q: string) =>
      Promise.resolve(
        q.includes("DURATION")
          ? [{ metric: {}, values: [[100, "240"], [200, "NaN"], [300, "260"]] }]
          : [{ metric: {}, values: [[100, "0.5"], [200, "1"], [300, "1.5"]] }],
      ),
    );

    const history = (await getSiteHistory("site-a", "24h"))!;

    expect(history.check.id).toBe("site-a");
    expect(history.window).toBe("24h");
    expect(history.status).toBe("up");
    expect(history.responseMs).toBe(240);
    expect(history.uptime).toEqual({
      "24h": 99.9,
      "7d": 99.9,
      "30d": 99.9,
      "1y": 99.9,
    });
    // Fractions are clamped to [0, 1]; the 1.5 reading caps at 1.
    expect(history.bars).toEqual([
      { t: 100, uptime: 0.5 },
      { t: 200, uptime: 1 },
      { t: 300, uptime: 1 },
    ]);
    // A non-finite response reading becomes null.
    expect(history.response).toEqual([
      { t: 100, ms: 240 },
      { t: 200, ms: null },
      { t: 300, ms: 260 },
    ]);
  });
});
