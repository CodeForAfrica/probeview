/**
 * Deterministic fixture data, used when Grafana Cloud creds are not configured
 * (or MOCK=1). Lets the UI be built & verified without secrets. Real data swaps
 * in transparently once env is set — see lib/synthetics.ts.
 */
import { bucketPlan } from "./buckets";
import { deriveStatus } from "./format";
import {
  WINDOW_KEYS,
  type CheckStatus,
  type MetricByWindow,
  type ResponsePoint,
  type SiteHistory,
  type UptimeBucket,
  type UptimeByWindow,
  type WindowKey,
} from "./types";

interface MockSite {
  id: string;
  name: string;
  target: string;
  region: string;
  /** Baseline uptime % over the long run. */
  baseUptime: number;
  /** Baseline response time, ms. */
  baseMs: number;
  currentlyUp: boolean;
}

const MOCK_SITES: MockSite[] = [
  { id: "pesacheck", name: "PesaCheck", target: "https://pesacheck.org", region: "Frankfurt", baseUptime: 99.98, baseMs: 240, currentlyUp: true },
  { id: "code-for-africa", name: "Code for Africa", target: "https://codeforafrica.org", region: "Frankfurt", baseUptime: 99.95, baseMs: 310, currentlyUp: true },
  { id: "sensors-africa", name: "sensors.AFRICA", target: "https://sensors.africa", region: "London", baseUptime: 99.7, baseMs: 420, currentlyUp: true },
  { id: "academy-africa", name: "Academy", target: "https://academy.africa", region: "Frankfurt", baseUptime: 98.6, baseMs: 530, currentlyUp: true },
  { id: "african-drone", name: "africanDRONE", target: "https://africandrone.org", region: "London", baseUptime: 93.2, baseMs: 870, currentlyUp: false },
  { id: "the-continent", name: "The Continent", target: "https://thecontinent.org", region: "New York", baseUptime: 99.99, baseMs: 180, currentlyUp: true },
];

/** Small deterministic PRNG so fixtures are stable across renders. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function uptimeByWindow(site: MockSite): UptimeByWindow {
  const r = rng(hash(site.id));
  const out = {} as UptimeByWindow;
  for (const key of WINDOW_KEYS) {
    // Shorter windows wobble a little more around the baseline.
    const spread = key === "24h" ? 0.4 : key === "7d" ? 0.25 : 0.12;
    const v = site.baseUptime + (r() - 0.5) * spread;
    out[key] = Math.min(100, Math.max(80, Number(v.toFixed(3))));
  }
  if (!site.currentlyUp) out["24h"] = Math.min(out["24h"] ?? 100, 91 + r() * 3);
  return out;
}

function responseByWindow(site: MockSite): MetricByWindow {
  const r = rng(hash(`${site.id}:resp`));
  const out = {} as MetricByWindow;
  for (const key of WINDOW_KEYS) {
    if (!site.currentlyUp) {
      out[key] = null;
      continue;
    }
    // Slightly different averages per window so the toggle visibly changes them.
    const v = site.baseMs * (0.85 + r() * 0.3);
    out[key] = Math.round(v);
  }
  return out;
}

export function mockOverview(): CheckStatus[] {
  return MOCK_SITES.map((site) => {
    const uptime = uptimeByWindow(site);
    return {
      id: site.id,
      name: site.name,
      target: site.target,
      job: site.name,
      instance: site.target,
      region: site.region,
      status: deriveStatus(site.currentlyUp, uptime["24h"]),
      uptime,
      responseMs: responseByWindow(site),
    };
  });
}

export function mockSiteHistory(id: string, window: WindowKey): SiteHistory | null {
  const site = MOCK_SITES.find((s) => s.id === id);
  if (!site) return null;

  const plan = bucketPlan(window);
  const uptime = uptimeByWindow(site);
  const r = rng(hash(`${site.id}:${window}`));

  const bars: UptimeBucket[] = [];
  const response: ResponsePoint[] = [];
  // Probability a bucket shows a dip, derived from baseline uptime.
  const dipChance = (100 - site.baseUptime) / 100;

  for (let i = 0; i < plan.count; i++) {
    const t = plan.startSec + i * plan.stepSec;
    const isRecent = i >= plan.count - 2;
    let frac = 1;
    if (r() < dipChance * 1.3) frac = 0.5 + r() * 0.45; // partial outage bucket
    if (!site.currentlyUp && isRecent) frac = r() < 0.6 ? 0 : 0.3; // current incident
    bars.push({ t, uptime: Number(frac.toFixed(3)) });

    const wobble = Math.sin(i / 4) * site.baseMs * 0.18 + (r() - 0.5) * site.baseMs * 0.25;
    const ms = frac === 0 ? null : Math.max(40, Math.round(site.baseMs + wobble));
    response.push({ t, ms });
  }

  const samples = response.map((p) => p.ms).filter((ms): ms is number => ms != null);
  const responseStats = samples.length
    ? {
      min: Math.min(...samples),
      avg: Math.round(samples.reduce((s, ms) => s + ms, 0) / samples.length),
      max: Math.max(...samples),
    }
    : { min: null, avg: null, max: null };

  return {
    check: {
      id: site.id,
      name: site.name,
      target: site.target,
      job: site.name,
      instance: site.target,
      region: site.region,
    },
    status: deriveStatus(site.currentlyUp, uptime["24h"]),
    uptime,
    responseMs: site.currentlyUp ? site.baseMs : null,
    window,
    bars,
    response,
    responseStats,
  };
}
