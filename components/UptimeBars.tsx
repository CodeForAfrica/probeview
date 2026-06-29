import { barColor, fmtPct } from "@/lib/format";
import type { UptimeBucket } from "@/lib/types";

const VIEW_W = 1000;
const VIEW_H = 64;
const GAP = 2;

function label(t: number): string {
  return new Date(t * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UptimeBars({ bars }: { bars: UptimeBucket[] }) {
  if (!bars.length) {
    return <p className="text-sm text-muted">No history available.</p>;
  }
  const n = bars.length;
  const barW = (VIEW_W - GAP * (n - 1)) / n;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      className="h-12 w-full"
      role="img"
      aria-label="Uptime history"
    >
      {bars.map((b, i) => (
        <rect
          key={b.t}
          x={i * (barW + GAP)}
          y={0}
          width={barW}
          height={VIEW_H}
          rx={2}
          fill={barColor(b.uptime)}
        >
          <title>
            {label(b.t)} — {b.uptime == null ? "no data" : fmtPct(b.uptime * 100)}
          </title>
        </rect>
      ))}
    </svg>
  );
}
