import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { UptimeBucket } from "@/lib/types";
import { UptimeBars } from "./UptimeBars";

// barColor (lib/format) maps an uptime fraction to a CSS variable using the
// default thresholds (operational 99.9%, degraded 95%). These are the colors
// the rects should carry.
const UP = "var(--bar-up)";
const DEGRADED = "var(--bar-degraded)";
const DOWN = "var(--bar-down)";
const EMPTY = "var(--bar-empty)";

function bars(...uptimes: (number | null)[]): UptimeBucket[] {
  // Bucket timestamps only need to be distinct (they become the React keys);
  // space them an hour apart starting from a fixed instant.
  return uptimes.map((uptime, i) => ({ t: 1_700_000_000 + i * 3600, uptime }));
}

describe("UptimeBars", () => {
  it("renders an empty-state message and no chart when there are no bars", () => {
    const { container } = render(<UptimeBars bars={[]} />);
    expect(screen.getByText("No history available.")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("exposes the chart as a labelled image", () => {
    render(<UptimeBars bars={bars(1)} />);
    expect(
      screen.getByRole("img", { name: "Uptime history" }),
    ).toBeInTheDocument();
  });

  it("draws one rect per bucket", () => {
    const { container } = render(<UptimeBars bars={bars(1, 0.97, 0.5)} />);
    expect(container.querySelectorAll("rect")).toHaveLength(3);
  });

  it("colors each rect by its uptime fraction", () => {
    // 100% → up, 99.9% → up (operational boundary), 97% → degraded,
    // 50% → down, null → empty.
    const { container } = render(
      <UptimeBars bars={bars(1, 0.999, 0.97, 0.5, null)} />,
    );
    const fills = [...container.querySelectorAll("rect")].map((r) =>
      r.getAttribute("fill"),
    );
    expect(fills).toEqual([UP, UP, DEGRADED, DOWN, EMPTY]);
  });

  it("lays a single bar across the full viewBox width", () => {
    const { container } = render(<UptimeBars bars={bars(1)} />);
    const rect = container.querySelector("rect")!;
    expect(rect.getAttribute("x")).toBe("0");
    expect(rect.getAttribute("width")).toBe("1000");
  });

  it("tiles bars left-to-right and fills the viewBox exactly", () => {
    const { container } = render(<UptimeBars bars={bars(1, 1, 1)} />);
    const rects = [...container.querySelectorAll("rect")];
    const xs = rects.map((r) => Number(r.getAttribute("x")));
    const widths = rects.map((r) => Number(r.getAttribute("width")));

    // First bar starts at the origin and x increases across the strip.
    expect(xs[0]).toBe(0);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(new Set(xs).size).toBe(xs.length);

    // The last bar's right edge lands on the viewBox width (1000), so the
    // strip neither overflows nor leaves a trailing gap.
    expect(xs.at(-1)! + widths.at(-1)!).toBeCloseTo(1000);
  });

  it("titles each rect with its formatted uptime percentage", () => {
    const { container } = render(<UptimeBars bars={bars(1)} />);
    const title = container.querySelector("rect > title")!;
    expect(title.textContent).toContain("— 100%");
  });

  it("titles a no-data bucket as such", () => {
    const { container } = render(<UptimeBars bars={bars(null)} />);
    const title = container.querySelector("rect > title")!;
    expect(title.textContent).toContain("— no data");
  });
});
