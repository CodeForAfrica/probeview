import "server-only";
import { unstable_cache } from "next/cache";
import { bucketPlan, responsePlan } from "./buckets";
import { config } from "./config";
import { checkId, checkIdentity, deriveStatus } from "./format";
import { mockOverview, mockSiteHistory } from "./mock";
import { escapeLabel, instantQuery, rangeQuery } from "./prometheus";
import {
  type Check,
  type MetricByWindow,
  type OverviewData,
  type ResponsePoint,
  type ResponseStats,
  type SiteHistory,
  type UptimeBucket,
  type UptimeByWindow,
  WINDOW_KEYS,
  WINDOWS,
  type WindowKey,
} from "./types";

const M = config.metrics;

const STAT_RES = "1h";

/** PromQL range-vector duration for a window (e.g. "7d"). */
function promRange(window: WindowKey): string {
  return window; // 24h / 7d / 30d / 1y are all valid PromQL durations
}

function matcher(check: Check): string {
  return `{job="${escapeLabel(check.job)}",instance="${escapeLabel(check.instance)}"}`;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/** List every synthetic check from `sm_check_info`, deduped by job+instance. */
export async function listChecks(): Promise<Check[]> {
  const samples = await instantQuery(M.info);
  const byKey = new Map<string, Check>();
  for (const s of samples) {
    const job = s.metric.job ?? s.metric.check_name ?? "";
    const instance = s.metric.instance ?? "";
    if (!job || !instance) continue;
    const k = checkIdentity(job, instance);
    if (byKey.has(k)) continue;
    byKey.set(k, {
      id: checkId(job, instance),
      name: job,
      target: instance,
      job,
      instance,
      region: s.metric.region,
    });
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function uptimeExpr(range: string): string {
  return (
    `100 * sum by (job, instance) (rate(${M.successSum}[${range}]))` +
    ` / sum by (job, instance) (rate(${M.successCount}[${range}]))`
  );
}

function responseExpr(range: string): string {
  return (
    `1000 * sum by (job, instance) (rate(${M.durationSum}[${range}]))` +
    ` / sum by (job, instance) (rate(${M.durationCount}[${range}]))`
  );
}

function toKeyedNumbers(
  samples: { metric: Record<string, string>; value: [number, string] }[],
) {
  const out = new Map<string, number>();
  for (const s of samples) {
    const v = Number(s.value[1]);
    if (Number.isFinite(v))
      out.set(checkIdentity(s.metric.job ?? "", s.metric.instance ?? ""), v);
  }
  return out;
}

async function fetchOverview(): Promise<OverviewData> {
  const checks = await listChecks();

  const results = await Promise.all([
    instantQuery(uptimeExpr(config.currentWindow)), // [0] current reachability
    ...WINDOWS.map((w) => instantQuery(uptimeExpr(promRange(w.key)))), // [1..n] uptime per window
    ...WINDOWS.map((w) => instantQuery(responseExpr(promRange(w.key)))), // [n+1..] response per window
  ]);

  const currentMap = toKeyedNumbers(results[0]);
  const uptimeMaps = WINDOWS.map((_, i) => toKeyedNumbers(results[1 + i]));
  const respMaps = WINDOWS.map((_, i) =>
    toKeyedNumbers(results[1 + WINDOWS.length + i]),
  );

  const statuses = checks.map((c) => {
    const k = checkIdentity(c.job, c.instance);
    const uptime = {} as MetricByWindow;
    const responseMs = {} as MetricByWindow;
    WINDOWS.forEach((w, i) => {
      const u = uptimeMaps[i].get(k);
      uptime[w.key] = u == null ? null : Number(u.toFixed(3));
      const r = respMaps[i].get(k);
      responseMs[w.key] = r == null ? null : Math.round(r);
    });
    // Current reachability over a short window: 0 = down, >0 = up, absent = unknown.
    const cur = currentMap.get(k);
    const currentlyUp = cur == null ? null : cur > 0;
    return {
      ...c,
      status: deriveStatus(currentlyUp, uptime["24h"]),
      uptime,
      responseMs,
    };
  });

  // Stamped here, inside the cached function, so it records when Grafana was
  // actually queried — the value only advances on a cache miss.
  return { checks: statuses, fetchedAt: Math.floor(Date.now() / 1000) };
}

/**
 * Public overview accessor — cached for `config.revalidate` seconds. This bounds
 * total Grafana query volume to one set of queries per refresh window, no matter
 * how many visitors hit the page. `fetchedAt` reflects that cached fetch time,
 * so callers can report true metric freshness rather than render time.
 */
export async function getOverview(): Promise<OverviewData> {
  if (config.mock) {
    return { checks: mockOverview(), fetchedAt: Math.floor(Date.now() / 1000) };
  }
  return unstable_cache(fetchOverview, ["overview"], {
    revalidate: config.revalidate,
    tags: ["status"],
  })();
}

// ---------------------------------------------------------------------------
// Per-site history
// ---------------------------------------------------------------------------

async function fetchSiteHistory(
  id: string,
  window: WindowKey,
): Promise<SiteHistory | null> {
  const checks = await listChecks();
  const check = checks.find((c) => c.id === id);
  if (!check) return null;

  const sel = matcher(check);
  // The bars use a fixed bar count; the response line caps its step at a day so
  // long windows (1y) still resolve recent history instead of a few wide buckets.
  const barPlan = bucketPlan(window);
  const respPlan = responsePlan(window);
  const barStep = `${barPlan.stepSec}s`;
  const respStep = `${respPlan.stepSec}s`;

  const barExpr =
    `sum(rate(${M.successSum}${sel}[${barStep}]))` +
    ` / sum(rate(${M.successCount}${sel}[${barStep}]))`;
  const respExpr =
    `1000 * sum(rate(${M.durationSum}${sel}[${respStep}]))` +
    ` / sum(rate(${M.durationCount}${sel}[${respStep}]))`;

  // Summary stats are computed over a fixed-resolution series (STAT_RES), not
  // the variable per-window buckets, so they stay comparable across windows.
  const statSeries =
    `1000 * sum(rate(${M.durationSum}${sel}[${STAT_RES}]))` +
    ` / sum(rate(${M.durationCount}${sel}[${STAT_RES}]))`;
  const statRange = `(${statSeries})[${promRange(window)}:${STAT_RES}]`;

  const [
    currentSamples,
    respNow,
    barSeries,
    respSeries,
    respMin,
    respAvg,
    respMax,
    ...uptimeSamples
  ] = await Promise.all([
    instantQuery(
      `100 * sum(rate(${M.successSum}${sel}[${config.currentWindow}]))` +
        ` / sum(rate(${M.successCount}${sel}[${config.currentWindow}]))`,
    ),
    instantQuery(
      `1000 * sum(rate(${M.durationSum}${sel}[24h])) / sum(rate(${M.durationCount}${sel}[24h]))`,
    ),
    rangeQuery(barExpr, barPlan.startSec, barPlan.endSec, barPlan.stepSec),
    rangeQuery(respExpr, respPlan.startSec, respPlan.endSec, respPlan.stepSec),
    instantQuery(`min_over_time(${statRange})`),
    instantQuery(`avg_over_time(${statRange})`),
    instantQuery(`max_over_time(${statRange})`),
    ...WINDOWS.map((w) =>
      instantQuery(
        `100 * sum(rate(${M.successSum}${sel}[${promRange(w.key)}]))` +
          ` / sum(rate(${M.successCount}${sel}[${promRange(w.key)}]))`,
      ),
    ),
  ]);

  const uptime = {} as UptimeByWindow;
  WINDOW_KEYS.forEach((wk, i) => {
    const v = Number(uptimeSamples[i][0]?.value[1]);
    uptime[wk] = Number.isFinite(v) ? Number(v.toFixed(3)) : null;
  });

  // Render the full window as a fixed grid: color the buckets Prometheus
  // returned and leave the rest as "no data". Prometheus only emits points where
  // a bucket has data, so mapping its output directly would stretch a few wide
  // bars across the strip and misstate the range when history is sparse.
  const barByIndex = new Map<number, number | null>();
  for (const [t, v] of barSeries[0]?.values ?? []) {
    const idx = Math.round((t - barPlan.startSec) / barPlan.stepSec) - 1;
    if (idx < 0 || idx >= barPlan.count) continue;
    const num = Number(v);
    barByIndex.set(
      idx,
      Number.isFinite(num) ? Math.min(1, Math.max(0, num)) : null,
    );
  }
  const bars: UptimeBucket[] = Array.from(
    { length: barPlan.count },
    (_, i) => ({
      t: barPlan.startSec + (i + 1) * barPlan.stepSec,
      uptime: barByIndex.get(i) ?? null,
    }),
  );

  const response: ResponsePoint[] = (respSeries[0]?.values ?? []).map(
    ([t, v]) => {
      const num = Number(v);
      return { t, ms: Number.isFinite(num) ? num : null };
    },
  );

  const curVal = Number(currentSamples[0]?.value[1]);
  const currentlyUp = Number.isFinite(curVal) ? curVal > 0 : null;
  const respValue = Number(respNow[0]?.value[1]);

  const statValue = (s: typeof respMin) => {
    const v = Number(s[0]?.value[1]);
    return Number.isFinite(v) ? v : null;
  };
  const responseStats: ResponseStats = {
    min: statValue(respMin),
    avg: statValue(respAvg),
    max: statValue(respMax),
  };

  return {
    check,
    status: deriveStatus(currentlyUp, uptime["24h"]),
    uptime,
    responseMs: Number.isFinite(respValue) ? respValue : null,
    window,
    bars,
    response,
    responseStats,
  };
}

/**
 * Public per-site accessor — cached per (id, window) for `config.revalidate`
 * seconds. A thousand views of the same site in that window cost one set of
 * Grafana queries, not a thousand.
 */
export async function getSiteHistory(
  id: string,
  window: WindowKey,
): Promise<SiteHistory | null> {
  if (config.mock) return mockSiteHistory(id, window);
  return unstable_cache(
    () => fetchSiteHistory(id, window),
    ["site-history", id, window],
    {
      revalidate: config.revalidate,
      tags: ["status"],
    },
  )();
}
