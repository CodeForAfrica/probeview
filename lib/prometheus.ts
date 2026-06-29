import "server-only";
import { config } from "./config";

export interface InstantSample {
  metric: Record<string, string>;
  value: [number, string];
}

export interface RangeSeries {
  metric: Record<string, string>;
  values: [number, string][];
}

class PrometheusError extends Error { }

async function call(
  path: "/api/v1/query" | "/api/v1/query_range" | "/api/v1/series",
  params: Record<string, string>,
): Promise<unknown> {
  if (!config.promUrl || !config.promUser || !config.promToken) {
    throw new PrometheusError(
      "Grafana Cloud Prometheus is not configured. Set GRAFANA_PROM_URL, " +
      "GRAFANA_PROM_USER and GRAFANA_PROM_TOKEN in .env.local (or run with MOCK=1).",
    );
  }

  const url = `${config.promUrl.replace(/\/$/, "")}${path}`;
  const auth = Buffer.from(`${config.promUser}:${config.promToken}`).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
    next: { revalidate: config.revalidate },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new PrometheusError(`Prometheus HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as { status: string; data?: unknown; error?: string };
  if (json.status !== "success") {
    throw new PrometheusError(`Prometheus query failed: ${json.error ?? "unknown error"}`);
  }
  return json.data;
}

export async function instantQuery(query: string): Promise<InstantSample[]> {
  const data = (await call("/api/v1/query", { query })) as {
    resultType: string;
    result: InstantSample[];
  };
  return data.result ?? [];
}

export async function rangeQuery(
  query: string,
  startSec: number,
  endSec: number,
  stepSec: number,
): Promise<RangeSeries[]> {
  const data = (await call("/api/v1/query_range", {
    query,
    start: String(startSec),
    end: String(endSec),
    step: String(stepSec),
  })) as { resultType: string; result: RangeSeries[] };
  return data.result ?? [];
}

/** Escape a label value for safe interpolation into a PromQL matcher. */
export function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
