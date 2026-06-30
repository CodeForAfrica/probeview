import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ResponsePoint } from "@/lib/types";
import { ResponseTimeChart } from "./ResponseTimeChart";

function pts(...ms: (number | null)[]): ResponsePoint[] {
  // Timestamps are unused by the chart's geometry (it scales by index), but
  // keep them distinct and ordered for realism.
  return ms.map((value, i) => ({ t: 1_700_000_000 + i * 3600, ms: value }));
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
    expect(container.querySelector('path[fill="url(#rt-fill)"]')).not.toBeNull();
    expect(container.querySelector('path[fill="none"]')).not.toBeNull();
  });

  it("scales the highest reading to the top and the lowest to the bottom", () => {
    // Two points span the full width; the slowest (300ms) sits near the top
    // (small y) and the fastest (100ms) near the bottom (large y).
    const { container } = render(<ResponseTimeChart points={pts(100, 300)} />);
    const line = container.querySelector('path[fill="none"]')!;
    expect(line.getAttribute("d")).toBe("M 0.0 146.0 L 1000.0 14.0");
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
});
