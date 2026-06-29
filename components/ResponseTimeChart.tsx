import { fmtMs } from "@/lib/format";
import type { ResponsePoint } from "@/lib/types";

const VIEW_W = 1000;
const VIEW_H = 160;
const PAD_Y = 14;

export function ResponseTimeChart({ points }: { points: ResponsePoint[] }) {
  const valid = points.filter((p) => p.ms != null) as { t: number; ms: number }[];
  if (valid.length < 2) {
    return <p className="text-sm text-muted">Not enough data to chart.</p>;
  }

  const min = Math.min(...valid.map((p) => p.ms));
  const max = Math.max(...valid.map((p) => p.ms));
  const avg = valid.reduce((s, p) => s + p.ms, 0) / valid.length;
  const span = max - min || 1;

  const x = (i: number) => (i / (points.length - 1)) * VIEW_W;
  const y = (ms: number) => PAD_Y + (1 - (ms - min) / span) * (VIEW_H - 2 * PAD_Y);

  // Split into contiguous segments, breaking on null (gap) points.
  const segments: { i: number; ms: number }[][] = [];
  let current: { i: number; ms: number }[] = [];
  points.forEach((p, i) => {
    if (p.ms == null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push({ i, ms: p.ms });
    }
  });
  if (current.length) segments.push(current);

  const toPath = (seg: { i: number; ms: number }[]) =>
    seg.map((pt, k) => `${k === 0 ? "M" : "L"} ${x(pt.i).toFixed(1)} ${y(pt.ms).toFixed(1)}`).join(" ");

  const line = segments.map(toPath).join(" ");

  // Area fill under the longest segment (keeps the gradient clean across gaps).
  const main = segments.reduce((a, b) => (b.length > a.length ? b : a), segments[0]);
  const area =
    `M ${x(main[0].i).toFixed(1)} ${VIEW_H - PAD_Y} ` +
    main.map((pt) => `L ${x(pt.i).toFixed(1)} ${y(pt.ms).toFixed(1)}`).join(" ") +
    ` L ${x(main[main.length - 1].i).toFixed(1)} ${VIEW_H - PAD_Y} Z`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="h-40 w-full"
        role="img"
        aria-label="Response time over time"
      >
        <defs>
          <linearGradient id="rt-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#rt-fill)" />
        <path
          d={line}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>min {fmtMs(min)}</span>
        <span>avg {fmtMs(avg)}</span>
        <span>max {fmtMs(max)}</span>
      </div>
    </div>
  );
}
