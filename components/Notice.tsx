export function MockNotice() {
  return (
    <div className="mb-5 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
      Showing <strong>sample data</strong>. Set <code>GRAFANA_PROM_URL</code>,{" "}
      <code>GRAFANA_PROM_USER</code> and <code>GRAFANA_PROM_TOKEN</code> in{" "}
      <code>.env.local</code> to display live Grafana Synthetics results.
    </div>
  );
}

export function CoverageNote({
  retentionDays,
}: {
  retentionDays: number | null;
}) {
  if (retentionDays == null) return null;
  return (
    <div className="rounded-xl border border-sky-300/60 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
      Only the last <strong>{retentionDays} days</strong> of monitoring data are
      retained on this plan — longer windows show what's available.
    </div>
  );
}

export function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-rose-300/60 bg-rose-50 px-6 py-6 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
      <h2 className="font-semibold">Could not load status data</h2>
      <p className="mt-1 text-sm break-words opacity-90">{message}</p>
    </div>
  );
}
