"use client";

import { fmtMs } from "@/lib/format";
import type { ResponsePoint, ResponseStats } from "@/lib/types";
import { useEffect, useRef, useState } from "react";

const HEIGHT = 200; // total SVG height, in px
const PAD = { top: 12, right: 12, bottom: 26, left: 48 };
// Used before the container has been measured (first paint and in jsdom, where
// ResizeObserver is unavailable). Any positive number works; it just sets the
// initial coordinate space until the real width arrives.
const FALLBACK_W = 640;
const ACCENT = "#3b82f6";

type ValidPoint = { t: number; ms: number };

/** Axis tick label: time-of-day for short windows, date for longer ones. */
function fmtAxisTime(t: number, spanSec: number): string {
  const d = new Date(t * 1000);
  if (spanSec <= 48 * 3600) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Full timestamp shown in the hover tooltip. */
function fmtStamp(t: number): string {
  return new Date(t * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ResponseTimeChart({
  points,
  stats,
}: {
  points: ResponsePoint[];
  stats?: ResponseStats | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_W);
  // Index into `valid` of the point under the cursor, or null when not hovering.
  const [hover, setHover] = useState<number | null>(null);

  // Track the container's real pixel width so the chart maps 1 user unit = 1px
  // and axis text renders without distortion.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const valid = points.filter((p) => p.ms != null) as ValidPoint[];
  if (valid.length < 2) {
    return <p className="text-sm text-muted">Not enough data to chart.</p>;
  }

  const msList = valid.map((p) => p.ms);
  const min = Math.min(...msList);
  const max = Math.max(...msList);
  const avg = msList.reduce((s, ms) => s + ms, 0) / msList.length;
  const span = max - min || 1;

  const ts = points.map((p) => p.t);
  const tMin = Math.min(...ts);
  const tMax = Math.max(...ts);
  const tSpan = tMax - tMin || 1;

  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const baseline = PAD.top + plotH;

  const x = (t: number) => PAD.left + ((t - tMin) / tSpan) * plotW;
  const y = (ms: number) => PAD.top + (1 - (ms - min) / span) * plotH;

  // Split into contiguous segments, breaking on null (gap) points. The line is
  // mapped by timestamp, so gaps show as real horizontal gaps.
  const segments: ValidPoint[][] = [];
  let current: ValidPoint[] = [];
  for (const p of points) {
    if (p.ms == null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push({ t: p.t, ms: p.ms });
    }
  }
  if (current.length) segments.push(current);

  const toPath = (seg: ValidPoint[]) =>
    seg.map((pt, k) => `${k === 0 ? "M" : "L"} ${x(pt.t).toFixed(1)} ${y(pt.ms).toFixed(1)}`).join(" ");
  const line = segments.map(toPath).join(" ");

  // Area fill under the longest segment (keeps the gradient clean across gaps).
  const main = segments.reduce((a, b) => (b.length > a.length ? b : a), segments[0]);
  const area =
    `M ${x(main[0].t).toFixed(1)} ${baseline} ` +
    main.map((pt) => `L ${x(pt.t).toFixed(1)} ${y(pt.ms).toFixed(1)}`).join(" ") +
    ` L ${x(main[main.length - 1].t).toFixed(1)} ${baseline} Z`;

  // Horizontal gridlines + ms labels down the Y axis.
  const yTicks = [0, 1, 2, 3].map((i) => {
    const ms = min + (i / 3) * (max - min);
    return { ms, y: y(ms) };
  });

  // Up to 5 evenly spaced time labels along the X axis.
  const xTickCount = Math.min(5, valid.length);
  const xTicks = Array.from({ length: xTickCount }, (_, i) => {
    const t = tMin + (i / (xTickCount - 1)) * tSpan;
    const anchor: "start" | "middle" | "end" =
      i === 0 ? "start" : i === xTickCount - 1 ? "end" : "middle";
    return { t, x: x(t), anchor };
  });

  const nearestIndex = (px: number) => {
    let best = 0;
    let bestDist = Infinity;
    valid.forEach((p, i) => {
      const d = Math.abs(x(p.t) - px);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  };

  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // Scale from rendered px back into the SVG's user units (1:1 once measured).
    const scale = rect.width ? width / rect.width : 1;
    setHover(nearestIndex((e.clientX - rect.left) * scale));
  };

  const active = hover != null ? valid[hover] : null;
  const tipLeft = active ? Math.min(Math.max(x(active.t), 64), width - 64) : 0;

  return (
    <div ref={wrapRef} className="relative">
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        className="touch-none select-none"
        role="img"
        aria-label="Response time over time"
        onPointerMove={handleMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="rt-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity="0.28" />
            <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y gridlines + ms labels */}
        {yTicks.map((tick) => (
          <g key={tick.ms}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={tick.y}
              y2={tick.y}
              className="stroke-border"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={tick.y}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted text-[10px]"
            >
              {fmtMs(tick.ms)}
            </text>
          </g>
        ))}

        {/* X time labels */}
        {xTicks.map((tick) => (
          <text
            key={tick.t}
            x={tick.x}
            y={HEIGHT - 8}
            textAnchor={tick.anchor}
            className="fill-muted text-[10px]"
          >
            {fmtAxisTime(tick.t, tSpan)}
          </text>
        ))}

        <path d={area} fill="url(#rt-fill)" />
        <path
          d={line}
          fill="none"
          stroke={ACCENT}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Hover crosshair + marker */}
        {active && (
          <g>
            <line
              x1={x(active.t)}
              x2={x(active.t)}
              y1={PAD.top}
              y2={baseline}
              stroke={ACCENT}
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.6"
            />
            <circle cx={x(active.t)} cy={y(active.ms)} r="4" fill={ACCENT} stroke="var(--surface)" strokeWidth="2" />
          </g>
        )}
      </svg>

      {active && (
        <div
          data-testid="rt-tooltip"
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-center shadow-sm"
          style={{ left: tipLeft, top: PAD.top }}
        >
          <div className="text-sm font-semibold tabular-nums">{fmtMs(active.ms)}</div>
          <div className="text-[11px] text-muted">{fmtStamp(active.t)}</div>
        </div>
      )}

      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>min {fmtMs(stats?.min ?? min)}</span>
        <span>avg {fmtMs(stats?.avg ?? avg)}</span>
        <span>max {fmtMs(stats?.max ?? max)}</span>
      </div>
    </div>
  );
}
