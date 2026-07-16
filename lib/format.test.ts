import { describe, expect, it } from "vitest";
import {
  barColor,
  checkId,
  deriveStatus,
  fmtMs,
  fmtPct,
  fmtRelative,
  slugify,
} from "./format";

describe("slugify", () => {
  it("lowercases and replaces non-alphanumerics with hyphens", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("Code for Africa")).toBe("code-for-africa");
  });

  it("strips the http(s):// scheme", () => {
    expect(slugify("https://pesacheck.org")).toBe("pesacheck-org");
    expect(slugify("http://example.com/path")).toBe("example-com-path");
  });

  it("collapses runs of separators into a single hyphen", () => {
    expect(slugify("a   b___c")).toBe("a-b-c");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  spaced  ")).toBe("spaced");
    expect(slugify("!!weird!!")).toBe("weird");
  });

  it("returns an empty string when there is nothing slug-able", () => {
    expect(slugify("")).toBe("");
    expect(slugify("---")).toBe("");
  });
});

describe("checkId", () => {
  it("prefixes the readable job slug and appends a hash suffix", () => {
    expect(checkId("PesaCheck", "https://pesacheck.org")).toMatch(
      /^pesacheck-[a-z0-9]+$/,
    );
    expect(checkId("The Continent", "https://thecontinent.org")).toMatch(
      /^the-continent-[a-z0-9]+$/,
    );
  });

  it("gives checks that share a job name but target different URLs distinct ids", () => {
    const a = checkId("Public API", "https://api.example.org");
    const b = checkId("Public API", "https://api.example.net");
    expect(a).not.toBe(b);
    expect(a.startsWith("public-api-")).toBe(true);
    expect(b.startsWith("public-api-")).toBe(true);
  });

  it("distinguishes job names that collide only after slug normalization", () => {
    const a = checkId("Public API", "https://api.example.org");
    const b = checkId("Public-API", "https://api.example.org");
    const c = checkId("Public.API", "https://api.example.org");
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(b).not.toBe(c);
    expect(a.startsWith("public-api-")).toBe(true);
    expect(b.startsWith("public-api-")).toBe(true);
    expect(c.startsWith("public-api-")).toBe(true);
  });

  it("is deterministic and depends only on the check's own identity", () => {
    // Same identity → same id, every call. No other check can influence it.
    expect(checkId("Public API", "https://api.example.org")).toBe(
      checkId("Public API", "https://api.example.org"),
    );
  });

  it("suffixes a 64-bit hash (pins the digest against a narrower regression)", () => {
    // Pinned value from a 64-bit FNV-1a over "Public API https://api.example.org".
    // A regression to the old 32-bit digest would change this suffix.
    expect(checkId("Public API", "https://api.example.org")).toBe(
      "public-api-3v89g0yt4y0l",
    );
  });

  it("falls back to the target slug, then 'check', for an empty job", () => {
    expect(checkId("", "https://example.org")).toMatch(
      /^example-org-[a-z0-9]+$/,
    );
    expect(checkId("", "")).toMatch(/^check-[a-z0-9]+$/);
  });
});

describe("fmtPct", () => {
  it("renders an em dash for null or NaN", () => {
    expect(fmtPct(null)).toBe("—");
    expect(fmtPct(NaN)).toBe("—");
  });

  it("clamps display at 100%", () => {
    expect(fmtPct(100)).toBe("100%");
    expect(fmtPct(100.5)).toBe("100%");
  });

  it("uses 3 decimals at or above 99.99", () => {
    expect(fmtPct(99.99)).toBe("99.990%");
    expect(fmtPct(99.995)).toBe("99.995%");
  });

  it("uses 2 decimals between 99 and 99.99", () => {
    expect(fmtPct(99)).toBe("99.00%");
    expect(fmtPct(99.5)).toBe("99.50%");
  });

  it("uses 1 decimal below 99", () => {
    expect(fmtPct(98.6)).toBe("98.6%");
    expect(fmtPct(0)).toBe("0.0%");
  });
});

describe("fmtMs", () => {
  it("renders an em dash for null or NaN", () => {
    expect(fmtMs(null)).toBe("—");
    expect(fmtMs(NaN)).toBe("—");
  });

  it("rounds to whole milliseconds below 1000", () => {
    expect(fmtMs(240)).toBe("240 ms");
    expect(fmtMs(240.6)).toBe("241 ms");
    expect(fmtMs(0)).toBe("0 ms");
  });

  it("switches to seconds with 2 decimals at or above 1000ms", () => {
    expect(fmtMs(1000)).toBe("1.00 s");
    expect(fmtMs(1530)).toBe("1.53 s");
  });
});

describe("deriveStatus", () => {
  it("is unknown when up state is unknown", () => {
    expect(deriveStatus(null, 100)).toBe("unknown");
    expect(deriveStatus(null, null)).toBe("unknown");
  });

  it("is down when not currently up", () => {
    expect(deriveStatus(false, 100)).toBe("down");
  });

  it("is degraded when up but 24h uptime is below the degraded threshold", () => {
    // config.thresholds.degraded defaults to 95.
    expect(deriveStatus(true, 94.9)).toBe("degraded");
  });

  it("is up when reachable and uptime is at or above the degraded threshold", () => {
    expect(deriveStatus(true, 95)).toBe("up");
    expect(deriveStatus(true, 99.99)).toBe("up");
  });

  it("is up when reachable but uptime is unavailable", () => {
    expect(deriveStatus(true, null)).toBe("up");
  });
});

describe("barColor", () => {
  it("is the empty color when uptime is null", () => {
    expect(barColor(null)).toBe("var(--bar-empty)");
  });

  it("is the up color at or above the operational threshold", () => {
    // operational defaults to 99.9 (fraction 0.999).
    expect(barColor(1)).toBe("var(--bar-up)");
    expect(barColor(0.999)).toBe("var(--bar-up)");
  });

  it("is the degraded color between the degraded and operational thresholds", () => {
    // degraded defaults to 95 (fraction 0.95).
    expect(barColor(0.95)).toBe("var(--bar-degraded)");
    expect(barColor(0.98)).toBe("var(--bar-degraded)");
  });

  it("is the down color below the degraded threshold", () => {
    expect(barColor(0.5)).toBe("var(--bar-down)");
    expect(barColor(0)).toBe("var(--bar-down)");
  });
});

describe("fmtRelative", () => {
  // Fixed reference clock so assertions are deterministic.
  const now = 1_700_000_000_000;
  const sec = (msAgo: number) => (now - msAgo) / 1000;

  it("says 'just now' under a minute", () => {
    expect(fmtRelative(sec(0), now)).toBe("just now");
    expect(fmtRelative(sec(29_000), now)).toBe("just now");
  });

  it("reports minutes under an hour", () => {
    expect(fmtRelative(sec(60_000), now)).toBe("1 min ago");
    expect(fmtRelative(sec(45 * 60_000), now)).toBe("45 min ago");
  });

  it("reports hours under a day", () => {
    expect(fmtRelative(sec(2 * 3_600_000), now)).toBe("2 h ago");
  });

  it("reports days beyond a day", () => {
    expect(fmtRelative(sec(3 * 86_400_000), now)).toBe("3 d ago");
  });

  it("clamps future timestamps to 'just now'", () => {
    expect(fmtRelative(sec(-10_000), now)).toBe("just now");
  });
});
