import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SiteHistory } from "@/lib/types";
import { generateMetadata } from "./page";

const { mockConfig, getSiteHistory } = vi.hoisted(() => ({
  mockConfig: { siteName: "Acme", retentionDays: null as number | null },
  getSiteHistory: vi.fn(),
}));

vi.mock("@/lib/config", () => ({ config: mockConfig }));
vi.mock("@/lib/synthetics", () => ({ getSiteHistory }));

function siteWith(job: string, target: string): SiteHistory {
  return {
    check: { id: "the-id", name: job, target, job, instance: target },
  } as SiteHistory;
}

const meta = (id: string, window?: string) =>
  generateMetadata({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(window ? { window } : {}),
  });

beforeEach(() => {
  getSiteHistory.mockReset();
});

describe("site detail generateMetadata", () => {
  it("uses the same retention-aware default window as the page", async () => {
    getSiteHistory.mockResolvedValue(null);

    await meta("the-id");

    expect(getSiteHistory).toHaveBeenCalledWith("the-id", "30d");
  });

  it("uses an explicit window from the query string", async () => {
    getSiteHistory.mockResolvedValue(null);

    await meta("the-id", "7d");

    expect(getSiteHistory).toHaveBeenCalledWith("the-id", "7d");
  });

  it("combines job and target without the check id", async () => {
    getSiteHistory.mockResolvedValue(
      siteWith("PesaCheck", "https://pesacheck.org"),
    );

    expect(await meta("pesacheck-abc123")).toEqual({
      title: "PesaCheck · pesacheck.org · Acme Status",
    });
  });

  it("dedupes when job and target are identical", async () => {
    getSiteHistory.mockResolvedValue(
      siteWith("academy.africa", "https://academy.africa"),
    );

    expect(await meta("academy-africa-abc123")).toEqual({
      title: "academy.africa · Acme Status",
    });
  });

  it("dedupes when job and target only differ by a trailing slash", async () => {
    getSiteHistory.mockResolvedValue(
      siteWith("academy.africa", "https://academy.africa/"),
    );

    expect(await meta("academy-africa-abc123")).toEqual({
      title: "academy.africa · Acme Status",
    });
  });

  it("falls back to the id when the check is not found", async () => {
    getSiteHistory.mockResolvedValue(null);

    expect(await meta("unknown-id")).toEqual({
      title: "unknown-id · Acme Status",
    });
  });

  it("falls back to the id when the lookup throws", async () => {
    getSiteHistory.mockRejectedValue(new Error("boom"));

    expect(await meta("some-id")).toEqual({
      title: "some-id · Acme Status",
    });
  });
});
