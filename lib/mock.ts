/**
 * Deterministic fixture data, used when Grafana Cloud creds are not configured
 * (or MOCK=1). Lets the UI be built & verified without secrets. Real data swaps
 * in transparently once env is set — see lib/synthetics.ts.
 */
import { bucketPlan } from "./buckets";
import { config } from "./config";
import { checkId, checkIdentity, deriveStatus, fnv1a } from "./format";
import {
  type CheckStatus,
  type MetricByWindow,
  type ResponsePoint,
  type SiteHistory,
  type UptimeBucket,
  type UptimeByWindow,
  WINDOW_KEYS,
  type WindowKey,
  windowWithinRetention,
} from "./types";

/** Retained span in seconds, or null when retention is unlimited. */
function retentionSec(): number | null {
  return config.retentionDays != null ? config.retentionDays * 86_400 : null;
}

interface MockSite {
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
  {
    name: "PesaCheck",
    target: "https://pesacheck.org",
    region: "Frankfurt",
    baseUptime: 99.98,
    baseMs: 240,
    currentlyUp: true,
  },
  {
    name: "Code for Africa",
    target: "https://codeforafrica.org",
    region: "Frankfurt",
    baseUptime: 99.95,
    baseMs: 310,
    currentlyUp: true,
  },
  {
    name: "sensors.AFRICA",
    target: "https://sensors.africa",
    region: "London",
    baseUptime: 99.7,
    baseMs: 420,
    currentlyUp: true,
  },
  {
    name: "Academy",
    target: "https://academy.africa",
    region: "Frankfurt",
    baseUptime: 98.6,
    baseMs: 530,
    currentlyUp: true,
  },
  {
    name: "africanDRONE",
    target: "https://africandrone.org",
    region: "London",
    baseUptime: 93.2,
    baseMs: 870,
    currentlyUp: false,
  },
  {
    name: "The Continent",
    target: "https://thecontinent.org",
    region: "New York",
    baseUptime: 99.99,
    baseMs: 180,
    currentlyUp: true,
  },
  // Two checks whose job names collide after slug normalization ("Public API"
  // and "Public-API" both slugify to "public-api") but target different URLs.
  // They exercise the (job, instance) id disambiguation end to end.
  {
    name: "Public API",
    target: "https://api.example.org",
    region: "Frankfurt",
    baseUptime: 99.9,
    baseMs: 150,
    currentlyUp: true,
  },
  {
    name: "Public-API",
    target: "https://api.example.net",
    region: "London",
    baseUptime: 99.8,
    baseMs: 160,
    currentlyUp: true,
  },
];

function idFor(site: MockSite): string {
  return checkId(site.name, site.target);
}

/** Stable RNG seed for a site, tied to its identity. */
function seedFor(site: MockSite): string {
  return checkIdentity(site.name, site.target);
}

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

function uptimeByWindow(site: MockSite): UptimeByWindow {
  const r = rng(fnv1a(seedFor(site)));
  const out = {} as UptimeByWindow;
  for (const key of WINDOW_KEYS) {
    // Windows beyond retention can't be reported honestly — mirror live mode
    // and mark them insufficient. Still advance the RNG so covered windows keep
    // their stable values regardless of the retention setting.
    // Shorter windows wobble a little more around the baseline.
    const spread = key === "24h" ? 0.4 : key === "7d" ? 0.25 : 0.12;
    const v = site.baseUptime + (r() - 0.5) * spread;
    out[key] = windowWithinRetention(key, config.retentionDays)
      ? Math.min(100, Math.max(80, Number(v.toFixed(3))))
      : null;
  }
  if (!site.currentlyUp && out["24h"] != null)
    out["24h"] = Math.min(out["24h"], 91 + r() * 3);
  return out;
}

function responseByWindow(site: MockSite): MetricByWindow {
  const r = rng(fnv1a(`${seedFor(site)}:resp`));
  const out = {} as MetricByWindow;
  for (const key of WINDOW_KEYS) {
    // Advance the RNG for every window so covered figures stay stable, then null
    // out down services and windows beyond retention.
    const v = site.baseMs * (0.85 + r() * 0.3);
    out[key] =
      !site.currentlyUp || !windowWithinRetention(key, config.retentionDays)
        ? null
        : Math.round(v);
  }
  return out;
}

export function mockOverview(): CheckStatus[] {
  return MOCK_SITES.map((site) => {
    const uptime = uptimeByWindow(site);
    return {
      id: idFor(site),
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

export function mockSiteHistory(
  id: string,
  window: WindowKey,
): SiteHistory | null {
  const site = MOCK_SITES.find((s) => idFor(s) === id);
  if (!site) return null;

  const plan = bucketPlan(window, undefined, retentionSec() ?? undefined);
  const uptime = uptimeByWindow(site);
  const r = rng(fnv1a(`${seedFor(site)}:${window}`));

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

    const wobble =
      Math.sin(i / 4) * site.baseMs * 0.18 + (r() - 0.5) * site.baseMs * 0.25;
    const ms =
      frac === 0 ? null : Math.max(40, Math.round(site.baseMs + wobble));
    response.push({ t, ms });
  }

  const samples = response
    .map((p) => p.ms)
    .filter((ms): ms is number => ms != null);
  const responseStats = samples.length
    ? {
        min: Math.min(...samples),
        avg: Math.round(samples.reduce((s, ms) => s + ms, 0) / samples.length),
        max: Math.max(...samples),
      }
    : { min: null, avg: null, max: null };

  return {
    check: {
      id,
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
