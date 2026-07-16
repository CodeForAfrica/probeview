import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoverageNote } from "./CoverageNote";

const STORAGE_KEY = "probeview:coverage-note-dismissed-until";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CoverageNote", () => {
  it("renders nothing when retention is unlimited", () => {
    const { container } = render(<CoverageNote retentionDays={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the retention message when retention is limited", () => {
    render(<CoverageNote retentionDays={14} />);
    expect(screen.getByText(/Only the last/)).toBeInTheDocument();
    expect(screen.getByText(/14 days/)).toBeInTheDocument();
  });

  it("hides on manual dismiss and remembers it for a week", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<CoverageNote retentionDays={14} />);

    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText(/Only the last/)).toBeNull();

    // The dismissal is persisted ~7 days out.
    const until = Number(localStorage.getItem(STORAGE_KEY));
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(until - Date.now()).toBeGreaterThan(sevenDays - 60_000);
    expect(until - Date.now()).toBeLessThanOrEqual(sevenDays);

    // A fresh mount within the window stays hidden.
    unmount();
    render(<CoverageNote retentionDays={14} />);
    expect(screen.queryByText(/Only the last/)).toBeNull();
  });

  it("shows again once a past dismissal has expired", () => {
    localStorage.setItem(STORAGE_KEY, String(Date.now() - 1000));
    render(<CoverageNote retentionDays={14} />);
    expect(screen.getByText(/Only the last/)).toBeInTheDocument();
  });

  it("auto-hides after the read window without persisting", () => {
    vi.useFakeTimers();
    try {
      render(<CoverageNote retentionDays={14} />);
      expect(screen.getByText(/Only the last/)).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(10_000);
      });

      // Gone from this view, but nothing was written — a reload would show it.
      expect(screen.queryByText(/Only the last/)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
