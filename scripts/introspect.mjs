#!/usr/bin/env node
/**
 * Confirms the Grafana Synthetic Monitoring metric/label schema on YOUR stack.
 *
 * Usage:
 *   node --env-file=.env.local scripts/introspect.mjs
 *
 * It checks which candidate metric names exist, shows their labels, lists your
 * checks from sm_check_info, and runs the exact uptime/status queries the app
 * uses — so we can see whether they return data (and fix metric names / label
 * joins if not).
 */

const url = (process.env.GRAFANA_PROM_URL || "").replace(/\/$/, "");
const user = process.env.GRAFANA_PROM_USER || "";
const token = process.env.GRAFANA_PROM_TOKEN || "";

if (!url || !user || !token) {
  console.error(
    "Missing env. Set GRAFANA_PROM_URL, GRAFANA_PROM_USER, GRAFANA_PROM_TOKEN " +
      "in .env.local and run: node --env-file=.env.local scripts/introspect.mjs",
  );
  process.exit(1);
}

const auth = `Basic ${Buffer.from(`${user}:${token}`).toString("base64")}`;

async function query(q) {
  const res = await fetch(`${url}/api/v1/query`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ query: q }).toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  const json = JSON.parse(text);
  if (json.status !== "success") throw new Error(json.error || "query failed");
  return json.data.result;
}

function labelsOf(series) {
  const m = { ...series.metric };
  delete m.__name__;
  return m;
}

const CANDIDATES = [
  "sm_check_info",
  "probe_all_success_sum",
  "probe_all_success_count",
  "probe_all_duration_seconds_sum",
  "probe_all_duration_seconds_count",
  "probe_success",
  "probe_duration_seconds_sum",
  "probe_duration_seconds_count",
  "probe_duration_seconds",
];

console.log(`\nEndpoint: ${url}\n`);
console.log("Metric availability (with a sample series' labels)");
console.log("--------------------------------------------------");
for (const name of CANDIDATES) {
  try {
    const r = await query(name);
    const mark = r.length ? "✓" : "·";
    console.log(`  ${mark} ${name}  (${r.length} series)`);
    if (r.length) {
      const lbl = labelsOf(r[0]);
      console.log(`      labels: ${JSON.stringify(lbl)}`);
    }
  } catch (e) {
    console.log(`  ✗ ${name}  (${e.message})`);
  }
}

console.log("\nChecks (from sm_check_info)");
console.log("---------------------------");
try {
  const checks = await query("sm_check_info");
  if (!checks.length)
    console.log("  none found — is the metric name different on your stack?");
  const seen = new Set();
  for (const c of checks) {
    const m = c.metric;
    const k = `${m.job} | ${m.instance}`;
    if (seen.has(k)) continue;
    seen.add(k);
    console.log(
      `  • job=${m.job}  instance=${m.instance}  region=${m.region ?? "-"}`,
    );
  }
  console.log(
    "\n  Available labels:",
    [...new Set(checks.flatMap((c) => Object.keys(c.metric)))].join(", "),
  );
} catch (e) {
  console.log("  error:", e.message);
}

// The exact queries the app runs — do they return data?
console.log("\nApp queries (do they return rows?)");
console.log("----------------------------------");
const PROBES = [
  [
    "status: max by (job,instance)(probe_success)",
    "max by (job, instance) (probe_success)",
  ],
  [
    "uptime 24h: rate(probe_all_success_sum)/rate(probe_all_success_count)",
    "100 * sum by (job, instance) (rate(probe_all_success_sum[24h])) / sum by (job, instance) (rate(probe_all_success_count[24h]))",
  ],
  [
    "response 24h: rate(probe_all_duration_seconds_sum)/_count",
    "1000 * sum by (job, instance) (rate(probe_all_duration_seconds_sum[24h])) / sum by (job, instance) (rate(probe_all_duration_seconds_count[24h]))",
  ],
];
for (const [label, q] of PROBES) {
  try {
    const r = await query(q);
    console.log(`  ${r.length ? "✓" : "✗ EMPTY"} ${label}  (${r.length} rows)`);
    if (r.length)
      console.log(
        `      e.g. ${JSON.stringify(labelsOf(r[0]))} = ${r[0].value[1]}`,
      );
  } catch (e) {
    console.log(`  ✗ ${label}  (${e.message})`);
  }
}
console.log("");
