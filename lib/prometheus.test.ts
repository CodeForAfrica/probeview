import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { escapeLabel, instantQuery, rangeQuery } from "./prometheus";

// A mutable mock config so individual tests can toggle the credential guard.
const { mockConfig } = vi.hoisted(() => ({
  mockConfig: {
    promUrl: "https://prom.example.net/api/prom/",
    promUser: "12345",
    promToken: "glc_token",
    metricsCacheSeconds: 60,
  },
}));
vi.mock("./config", () => ({ config: mockConfig }));

const DEFAULTS = { ...mockConfig };

/** Build a Prometheus-shaped fetch Response stub. */
function promResponse(
  data: unknown,
  { ok = true, status = 200, body = "success" } = {},
) {
  return {
    ok,
    status,
    json: async () => ({ status: body, data, error: "boom" }),
    text: async () => "error body",
  } as unknown as Response;
}

beforeEach(() => {
  Object.assign(mockConfig, DEFAULTS);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("escapeLabel", () => {
  it("escapes backslashes then double quotes", () => {
    expect(escapeLabel('a\\b"c')).toBe('a\\\\b\\"c');
  });

  it("leaves plain values untouched", () => {
    expect(escapeLabel("https://pesacheck.org")).toBe("https://pesacheck.org");
  });
});

describe("call (via instantQuery)", () => {
  it("throws a helpful error when credentials are missing", async () => {
    mockConfig.promToken = "";
    await expect(instantQuery("up")).rejects.toThrow(/not configured/i);
  });

  it("sends Basic auth, strips the trailing slash, and form-encodes the query", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(promResponse({ resultType: "vector", result: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await instantQuery("up == 1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://prom.example.net/api/prom/api/v1/query");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from("12345:glc_token").toString("base64")}`,
    );
    expect(init.headers["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(init.body).toBe("query=up+%3D%3D+1");
    expect(init.next).toEqual({ revalidate: 60 });
  });

  it("throws with the HTTP status on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(promResponse(null, { ok: false, status: 503 })),
    );
    await expect(instantQuery("up")).rejects.toThrow(/HTTP 503/);
  });

  it("throws when the payload status is not 'success'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(promResponse(null, { body: "error" })),
    );
    await expect(instantQuery("up")).rejects.toThrow(/query failed: boom/);
  });
});

describe("instantQuery", () => {
  it("returns the result array", async () => {
    const result = [{ metric: { job: "x" }, value: [1, "2"] }];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(promResponse({ resultType: "vector", result })),
    );
    expect(await instantQuery("up")).toEqual(result);
  });

  it("defaults to an empty array when result is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(promResponse({ resultType: "vector" })),
    );
    expect(await instantQuery("up")).toEqual([]);
  });
});

describe("rangeQuery", () => {
  it("form-encodes start, end, and step as strings", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(promResponse({ resultType: "matrix", result: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await rangeQuery("rate(x[5m])", 1000, 2000, 30);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://prom.example.net/api/prom/api/v1/query_range");
    const params = new URLSearchParams(init.body);
    expect(params.get("query")).toBe("rate(x[5m])");
    expect(params.get("start")).toBe("1000");
    expect(params.get("end")).toBe("2000");
    expect(params.get("step")).toBe("30");
  });

  it("returns the result series", async () => {
    const result = [{ metric: {}, values: [[1, "2"]] }];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(promResponse({ resultType: "matrix", result })),
    );
    expect(await rangeQuery("x", 0, 1, 1)).toEqual(result);
  });
});
