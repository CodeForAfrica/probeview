import type { Metadata } from "next";
import Link from "next/link";
import { CoverageNote } from "@/components/CoverageNote";
import { ArrowLeft, ExternalLink } from "@/components/icons";
import { ErrorPanel } from "@/components/Notice";
import { ResponseTimeChart } from "@/components/ResponseTimeChart";
import { StatusBadge } from "@/components/StatusBadge";
import { UptimeBars } from "@/components/UptimeBars";
import { config } from "@/lib/config";
import { fmtMs, fmtPct } from "@/lib/format";
import { getSiteHistory } from "@/lib/synthetics";
import {
  defaultWindow,
  type SiteHistory,
  WINDOW_KEYS,
  WINDOWS,
  type WindowKey,
} from "@/lib/types";

type SitePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ window?: string | string[] }>;
};

function parseWindow(value: string | string[] | undefined): WindowKey {
  return typeof value === "string" &&
    (WINDOW_KEYS as string[]).includes(value)
    ? (value as WindowKey)
    : defaultWindow(config.retentionDays);
}

export async function generateMetadata({
  params,
  searchParams,
}: SitePageProps): Promise<Metadata> {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const window = parseWindow(query.window);
  const site = await getSiteHistory(id, window).catch(() => null);
  let label = id;
  if (site) {
    const target = site.check.target
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    label =
      site.check.job && site.check.job !== target
        ? `${site.check.job} · ${target}`
        : site.check.job || target;
  }
  return { title: `${label} · ${config.siteName} Status` };
}

export default async function SitePage({
  params,
  searchParams,
}: SitePageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const window = parseWindow(query.window);

  let site: SiteHistory | null;
  try {
    site = await getSiteHistory(id, window);
  } catch (e) {
    return <ErrorPanel message={e instanceof Error ? e.message : String(e)} />;
  }

  if (!site) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorPanel message={`No monitored service found for "${id}".`} />
      </div>
    );
  }

  const rangeLabel =
    site.bars.length > 0
      ? `${new Date(site.bars[0].t * 1000).toLocaleDateString()} – ${new Date(
          site.bars[site.bars.length - 1].t * 1000,
        ).toLocaleDateString()}`
      : "";

  return (
    <div className="space-y-8">
      <BackLink />

      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {site.check.name}
          </h1>
          <StatusBadge status={site.status} />
        </div>
        <a
          href={site.check.target}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          {site.check.target.replace(/^https?:\/\//, "")}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </header>

      <CoverageNote retentionDays={config.retentionDays} />

      {/* Uptime numbers across all windows */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-5">
        {WINDOWS.map((w) => (
          <div key={w.key} className="bg-surface px-4 py-4">
            <div className="text-lg font-semibold tabular-nums">
              {fmtPct(site.uptime[w.key])}
            </div>
            <div className="text-xs text-muted">{w.label} uptime</div>
          </div>
        ))}
      </section>

      <WindowTabs id={id} active={window} />

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-medium">Response time</h2>
          <span className="text-sm text-muted">
            now {fmtMs(site.responseMs)}
          </span>
        </div>
        <ResponseTimeChart points={site.response} stats={site.responseStats} />
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-medium">Uptime</h2>
          <span className="text-sm text-muted">{rangeLabel}</span>
        </div>
        <UptimeBars bars={site.bars} />
      </section>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      All services
    </Link>
  );
}

function WindowTabs({ id, active }: { id: string; active: WindowKey }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface p-0.5 text-sm">
      {WINDOWS.map((w) => (
        <Link
          key={w.key}
          href={`/site/${id}?window=${w.key}`}
          scroll={false}
          aria-current={active === w.key ? "page" : undefined}
          className={`rounded-md px-3 py-1 transition-colors ${
            active === w.key
              ? "bg-foreground text-background"
              : "text-muted hover:text-foreground"
          }`}
        >
          {w.key}
        </Link>
      ))}
    </div>
  );
}
