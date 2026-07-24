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
  windowWithinRetention,
} from "./types";

const M = config.metrics;

const STAT_RES = "1h";

/** Current time as unix seconds — stamped as the data's fetch time. */
function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Retained span in seconds, or null when retention is unlimited. */
function retentionSec(): number | null {
  return config.retentionDays != null ? config.retentionDays * 86_400 : null;
}

/** Windows fully covered by the plan's retention — the only ones worth querying. */
function coveredWindows() {
  return WINDOWS.filter((w) =>
    windowWithinRetention(w.key, config.retentionDays),
  );
}

/** PromQL range-vector duration for a window (e.g. "7d"). */
function promRange(window: WindowKey): string {
  return window; // 24h / 7d / 14d / 30d / 1y are all valid PromQL durations
}

function matcher(check: Check): string {
  return `{job="${escapeLabel(check.job)}",instance="${escapeLabel(check.instance)}"}`;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/**
 * Read a configured Grafana custom label off an `sm_check_info` sample. Custom
 * labels surface with a `label_` prefix, so `SM_GROUP_LABEL=product` maps to
 * `metric.label_product`. Returns `undefined` when the label name is unset or
 * the sample has no (non-empty) value for it.
 */
function customLabel(
  metric: Record<string, string>,
  labelName: string,
): string | undefined {
  if (!labelName) return undefined;
  const v = metric[`label_${labelName}`]?.trim();
  return v || undefined;
}

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
      group: customLabel(s.metric, config.groupLabel),
      purpose: customLabel(s.metric, config.purposeLabel),
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

  // Only query windows within retention; longer windows can't be reported
  // honestly, so we skip their queries entirely (fewer Grafana calls) and mark
  // them insufficient below.
  const covered = coveredWindows();
  const results = await Promise.all([
    instantQuery(uptimeExpr(config.currentWindow)), // [0] current reachability
    ...covered.map((w) => instantQuery(uptimeExpr(promRange(w.key)))),
    ...covered.map((w) => instantQuery(responseExpr(promRange(w.key)))),
  ]);

  const currentMap = toKeyedNumbers(results[0]);
  const uptimeByWindow = new Map<WindowKey, Map<string, number>>();
  const respByWindow = new Map<WindowKey, Map<string, number>>();
  covered.forEach((w, i) => {
    uptimeByWindow.set(w.key, toKeyedNumbers(results[1 + i]));
    respByWindow.set(w.key, toKeyedNumbers(results[1 + covered.length + i]));
  });

  const statuses = checks.map((c) => {
    const k = checkIdentity(c.job, c.instance);
    const uptime = {} as MetricByWindow;
    const responseMs = {} as MetricByWindow;
    WINDOWS.forEach((w) => {
      // Windows beyond retention were never queried: report `null` (renders
      // `—`) rather than a misleading ratio over a partial range.
      const u = uptimeByWindow.get(w.key)?.get(k);
      uptime[w.key] = u == null ? null : Number(u.toFixed(3));
      const r = respByWindow.get(w.key)?.get(k);
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
  return { checks: statuses, fetchedAt: nowSeconds() };
}

/**
 * Public overview accessor — cached for `config.metricsCacheSeconds` seconds.
 * This bounds total Grafana query volume to one set of queries per refresh
 * window, no matter how many visitors hit the page. `fetchedAt` reflects that
 * cached fetch time, so callers can report true metric freshness rather than
 * render time.
 */
export async function getOverview(): Promise<OverviewData> {
  if (config.mock) {
    return { checks: mockOverview(), fetchedAt: nowSeconds() };
  }
  return unstable_cache(fetchOverview, ["overview"], {
    revalidate: config.metricsCacheSeconds,
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
  const retention = retentionSec();
  const covered = coveredWindows();
  // The bars use a fixed bar count; the response line caps its step at a day so
  // long windows (1y) still resolve recent history instead of a few wide buckets.
  // When the selected window exceeds retention, clamp the span so the charts
  // show the retained data at usable density instead of a near-empty strip.
  const barPlan = bucketPlan(window, undefined, retention ?? undefined);
  const respPlan = responsePlan(window, undefined, retention ?? undefined);
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
  // The sub-query range is clamped to retention so the stats describe the same
  // span the clamped chart shows.
  const statSpanSec = WINDOWS.find((w) => w.key === window)?.seconds ?? 0;
  const statRangeStr =
    retention != null && statSpanSec > retention
      ? `${retention}s`
      : promRange(window);
  const statSeries =
    `1000 * sum(rate(${M.durationSum}${sel}[${STAT_RES}]))` +
    ` / sum(rate(${M.durationCount}${sel}[${STAT_RES}]))`;
  const statRange = `(${statSeries})[${statRangeStr}:${STAT_RES}]`;

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
    // Only windows within retention are queried; the rest stay insufficient.
    ...covered.map((w) =>
      instantQuery(
        `100 * sum(rate(${M.successSum}${sel}[${promRange(w.key)}]))` +
          ` / sum(rate(${M.successCount}${sel}[${promRange(w.key)}]))`,
      ),
    ),
  ]);

  const uptime = {} as UptimeByWindow;
  for (const wk of WINDOW_KEYS) uptime[wk] = null;
  covered.forEach((w, i) => {
    const v = Number(uptimeSamples[i][0]?.value[1]);
    uptime[w.key] = Number.isFinite(v) ? Number(v.toFixed(3)) : null;
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
 * Public per-site accessor — cached per (id, window) for
 * `config.metricsCacheSeconds` seconds. A thousand views of the same site in
 * that window cost one set of Grafana queries, not a thousand.
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
      revalidate: config.metricsCacheSeconds,
      tags: ["status"],
    },
  )();
}
