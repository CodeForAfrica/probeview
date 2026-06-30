import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { CheckStatus, Status, WindowKey } from "@/lib/types";
import { Overview } from "./Overview";

// Build a full per-window metric record from one value (overridable per window).
function byWindow(
  value: number | null,
  over: Partial<Record<WindowKey, number | null>> = {},
): Record<WindowKey, number | null> {
  return { "24h": value, "7d": value, "30d": value, "1y": value, ...over };
}

function check(
  over: Partial<CheckStatus> & Pick<CheckStatus, "id" | "name">,
): CheckStatus {
  return {
    target: `https://${over.id}.example`,
    job: over.name,
    instance: over.id,
    status: "up" as Status,
    uptime: byWindow(99.9),
    responseMs: byWindow(100),
    ...over,
  };
}

// Order of the rendered rows, by site id (each row is a link to /site/{id}).
function rowIds(): string[] {
  return screen
    .getAllByRole("link")
    .map((a) => a.getAttribute("href")!.replace("/site/", ""));
}

describe("Overview banner", () => {
  it("reports all-operational and an operational count in the subtitle", () => {
    render(
      <Overview
        checks={[check({ id: "a", name: "A" }), check({ id: "b", name: "B" })]}
        updated="2m ago"
      />,
    );
    expect(screen.getByText("All systems operational")).toBeInTheDocument();
    expect(
      screen.getByText("2/2 services operational · updated 2m ago"),
    ).toBeInTheDocument();
  });

  it("flags degraded performance when a service is degraded", () => {
    render(
      <Overview
        checks={[
          check({ id: "a", name: "A" }),
          check({ id: "b", name: "B", status: "degraded" }),
        ]}
        updated="now"
      />,
    );
    expect(screen.getByText("Degraded performance")).toBeInTheDocument();
    expect(
      screen.getByText("1/2 services operational · updated now"),
    ).toBeInTheDocument();
  });

  it("escalates to a partial outage when any service is down", () => {
    render(
      <Overview
        checks={[
          check({ id: "a", name: "A", status: "degraded" }),
          check({ id: "b", name: "B", status: "down" }),
        ]}
        updated="now"
      />,
    );
    // Down outranks degraded.
    expect(screen.getByText("Partial system outage")).toBeInTheDocument();
  });

  it("shows status unavailable when every service is unknown", () => {
    render(
      <Overview
        checks={[
          check({ id: "a", name: "A", status: "unknown" }),
          check({ id: "b", name: "B", status: "unknown" }),
        ]}
        updated="now"
      />,
    );
    expect(screen.getByText("Status unavailable")).toBeInTheDocument();
  });
});

describe("Overview rows", () => {
  it("renders a link per service with its hostname stripped of protocol", () => {
    render(
      <Overview
        checks={[check({ id: "pesacheck", name: "PesaCheck" })]}
        updated="now"
      />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/site/pesacheck");
    expect(screen.getByText("PesaCheck")).toBeInTheDocument();
    expect(screen.getByText("pesacheck.example")).toBeInTheDocument();
  });
});

describe("Overview sorting", () => {
  // Distinct uptime/response per service so order is unambiguous (30d window).
  const checks = [
    check({ id: "alpha", name: "Alpha", uptime: byWindow(99.95), responseMs: byWindow(100) }),
    check({ id: "bravo", name: "Bravo", uptime: byWindow(99.0), responseMs: byWindow(300) }),
    check({ id: "charlie", name: "Charlie", uptime: byWindow(99.99), responseMs: byWindow(50) }),
  ];

  it("defaults to sorting by name, ascending", () => {
    render(<Overview checks={checks} updated="now" />);
    expect(rowIds()).toEqual(["alpha", "bravo", "charlie"]);
  });

  it("sorts by uptime worst-first, then toggles to best-first", async () => {
    const user = userEvent.setup();
    render(<Overview checks={checks} updated="now" />);

    await user.click(screen.getByRole("button", { name: /Sort by Uptime/ }));
    expect(rowIds()).toEqual(["bravo", "alpha", "charlie"]); // ascending: worst first

    await user.click(screen.getByRole("button", { name: /Sort by Uptime/ }));
    expect(rowIds()).toEqual(["charlie", "alpha", "bravo"]); // descending: best first
  });

  it("sorts by response slowest-first by default", async () => {
    const user = userEvent.setup();
    render(<Overview checks={checks} updated="now" />);

    await user.click(screen.getByRole("button", { name: /Sort by Response/ }));
    expect(rowIds()).toEqual(["bravo", "alpha", "charlie"]); // descending: slowest first
  });

  it("keeps services with no data at the bottom in both directions", async () => {
    const user = userEvent.setup();
    render(
      <Overview
        checks={[
          check({ id: "a", name: "A", uptime: byWindow(99) }),
          check({ id: "b", name: "B", uptime: byWindow(null) }),
          check({ id: "c", name: "C", uptime: byWindow(95) }),
        ]}
        updated="now"
      />,
    );

    await user.click(screen.getByRole("button", { name: /Sort by Uptime/ }));
    expect(rowIds()).toEqual(["c", "a", "b"]); // ascending, null last

    await user.click(screen.getByRole("button", { name: /Sort by Uptime/ }));
    expect(rowIds()).toEqual(["a", "c", "b"]); // descending, null still last
  });
});

describe("Overview search", () => {
  const checks = [
    check({ id: "pesacheck", name: "PesaCheck", target: "https://pesacheck.org" }),
    check({ id: "the-continent", name: "The Continent", target: "https://thecontinent.org" }),
    check({ id: "sensors", name: "sensors.AFRICA", target: "https://sensors.africa" }),
  ];

  it("filters by name as you type, case-insensitively", async () => {
    const user = userEvent.setup();
    render(<Overview checks={checks} updated="now" />);

    await user.type(screen.getByRole("searchbox"), "pesa");
    expect(rowIds()).toEqual(["pesacheck"]);
  });

  it("matches against the URL, not just the name", async () => {
    const user = userEvent.setup();
    render(<Overview checks={checks} updated="now" />);

    // "continent" only appears in the target host, not the lowercased query path.
    await user.type(screen.getByRole("searchbox"), "thecontinent");
    expect(rowIds()).toEqual(["the-continent"]);
  });

  it("reports the match count and restores the full list when cleared", async () => {
    const user = userEvent.setup();
    render(<Overview checks={checks} updated="now" />);

    const box = screen.getByRole("searchbox");
    await user.type(box, "africa");
    expect(rowIds()).toEqual(["sensors"]);
    expect(screen.getByText("1 of 3 services")).toBeInTheDocument();

    await user.clear(box);
    expect(rowIds()).toEqual(["pesacheck", "sensors", "the-continent"]);
    expect(screen.getByText("Services")).toBeInTheDocument();
  });

  it("shows an empty state when nothing matches", async () => {
    const user = userEvent.setup();
    render(<Overview checks={checks} updated="now" />);

    await user.type(screen.getByRole("searchbox"), "nope");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText(/No services match/)).toBeInTheDocument();
  });
});

describe("Overview window toggle", () => {
  it("switches the displayed window and re-sorts on its values", async () => {
    const user = userEvent.setup();
    // Default window is 30d; 24h tells a different story for sorting.
    const checks = [
      check({
        id: "alpha",
        name: "Alpha",
        uptime: byWindow(99.9, { "24h": 80 }),
      }),
      check({
        id: "bravo",
        name: "Bravo",
        uptime: byWindow(99.0, { "24h": 100 }),
      }),
    ];
    render(<Overview checks={checks} updated="now" />);

    // Rows are labelled for the active (30d) window.
    expect(screen.getAllByText("30d uptime")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "24h" }));

    // Labels follow the selected window...
    expect(screen.getAllByText("24h uptime")).toHaveLength(2);
    expect(screen.queryByText("30d uptime")).toBeNull();

    // ...and sorting by uptime now uses the 24h numbers (Alpha 80 < Bravo 100).
    await user.click(screen.getByRole("button", { name: /Sort by Uptime/ }));
    expect(rowIds()).toEqual(["alpha", "bravo"]);
  });
});
