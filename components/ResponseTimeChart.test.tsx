import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ResponsePoint } from "@/lib/types";
import { ResponseTimeChart } from "./ResponseTimeChart";

function pts(...ms: (number | null)[]): ResponsePoint[] {
  // Hourly samples — the chart maps the X axis by timestamp.
  return ms.map((value, i) => ({ t: 1_700_000_000 + i * 3600, ms: value }));
}

/** Parse an SVG path's "M x y L x y …" commands into [x, y] coordinate pairs. */
function coords(d: string): [number, number][] {
  const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}

describe("ResponseTimeChart", () => {
  it("shows a fallback when there are no points", () => {
    const { container } = render(<ResponseTimeChart points={[]} />);
    expect(screen.getByText("Not enough data to chart.")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("shows a fallback when every point is missing", () => {
    render(<ResponseTimeChart points={pts(null, null, null)} />);
    expect(screen.getByText("Not enough data to chart.")).toBeInTheDocument();
  });

  it("shows a fallback when only one valid reading exists", () => {
    // A single sample can't form a line; nulls around it don't count.
    render(<ResponseTimeChart points={pts(null, 120, null)} />);
    expect(screen.getByText("Not enough data to chart.")).toBeInTheDocument();
  });

  it("exposes the chart as a labelled image", () => {
    render(<ResponseTimeChart points={pts(100, 300)} />);
    expect(
      screen.getByRole("img", { name: "Response time over time" }),
    ).toBeInTheDocument();
  });

  it("draws both an area fill and a line", () => {
    const { container } = render(<ResponseTimeChart points={pts(100, 300)} />);
    expect(
      container.querySelector('path[fill="url(#rt-fill)"]'),
    ).not.toBeNull();
    expect(container.querySelector('path[fill="none"]')).not.toBeNull();
  });

  it("scales the highest reading to the top and the lowest to the bottom", () => {
    // Earliest sample sits at the left, latest at the right; the slowest (300ms)
    // sits higher (smaller y) than the fastest (100ms).
    const { container } = render(<ResponseTimeChart points={pts(100, 300)} />);
    const line = container.querySelector('path[fill="none"]')!;
    const [first, last] = coords(line.getAttribute("d")!);
    expect(first[0]).toBeLessThan(last[0]); // time increases left → right
    expect(last[1]).toBeLessThan(first[1]); // 300ms (last) is higher up
  });

  it("labels the time axis", () => {
    // Hourly UTC samples around 2023-11-14; rendered as locale time-of-day.
    const { container } = render(
      <ResponseTimeChart points={pts(100, 200, 300)} />,
    );
    const labels = [...container.querySelectorAll("text")].map(
      (t) => t.textContent,
    );
    // At least one axis label should look like a clock time (e.g. "09:13").
    expect(labels.some((l) => /\d{1,2}:\d{2}/.test(l ?? ""))).toBe(true);
  });

  it("reveals the value at a point on hover", () => {
    const { container } = render(<ResponseTimeChart points={pts(100, 300)} />);
    const svg = container.querySelector("svg")!;
    // No tooltip until the pointer moves over the chart.
    expect(screen.queryByTestId("rt-tooltip")).toBeNull();
    // Move toward the right edge — nearest to the latest (300ms) sample.
    fireEvent.pointerMove(svg, { clientX: 9999 });
    expect(screen.getByTestId("rt-tooltip")).toHaveTextContent("300 ms");
  });

  it("hides the tooltip when the pointer leaves", () => {
    const { container } = render(<ResponseTimeChart points={pts(100, 300)} />);
    const svg = container.querySelector("svg")!;
    fireEvent.pointerMove(svg, { clientX: 9999 });
    expect(screen.getByTestId("rt-tooltip")).toBeInTheDocument();
    fireEvent.pointerLeave(svg);
    expect(screen.queryByTestId("rt-tooltip")).toBeNull();
  });

  it("breaks the line into separate segments across a gap", () => {
    // A null in the middle splits the line into two moves (two `M` commands)
    // while keeping each point at its original horizontal index.
    const { container } = render(
      <ResponseTimeChart points={pts(100, 200, null, 300, 250)} />,
    );
    const d = container.querySelector('path[fill="none"]')!.getAttribute("d")!;
    expect(d.match(/M/g)).toHaveLength(2);
  });

  it("summarizes min, average, and max response times", () => {
    render(<ResponseTimeChart points={pts(100, 200, 300)} />);
    expect(screen.getByText("min 100 ms")).toBeInTheDocument();
    expect(screen.getByText("avg 200 ms")).toBeInTheDocument();
    expect(screen.getByText("max 300 ms")).toBeInTheDocument();
  });

  it("prefers window-consistent stats over the plotted points for the summary", () => {
    // The plotted (downsampled) points peak at 300ms, but the fixed-resolution
    // stats know the real peak was 7.56s. The footer must trust the stats so
    // the figure stays comparable across windows.
    render(
      <ResponseTimeChart
        points={pts(100, 300)}
        stats={{ min: 90, avg: 410, max: 7560 }}
      />,
    );
    expect(screen.getByText("min 90 ms")).toBeInTheDocument();
    expect(screen.getByText("avg 410 ms")).toBeInTheDocument();
    expect(screen.getByText("max 7.56 s")).toBeInTheDocument();
  });
});
