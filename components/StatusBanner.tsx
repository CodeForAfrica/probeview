import type { Status } from "@/lib/types";
import { AlertTriangle, CheckCircle } from "./icons";

const BANNER: Record<Status, { title: string; bg: string }> = {
  up: { title: "All systems operational", bg: "bg-emerald-500" },
  degraded: { title: "Degraded performance", bg: "bg-amber-500" },
  down: { title: "Partial system outage", bg: "bg-rose-500" },
  unknown: { title: "Status unavailable", bg: "bg-zinc-500" },
};

export function StatusBanner({
  status,
  subtitle,
}: {
  status: Status;
  subtitle?: string;
}) {
  const b = BANNER[status];
  const Icon = status === "up" ? CheckCircle : AlertTriangle;
  return (
    <div
      className={`flex items-center gap-4 rounded-2xl px-6 py-6 text-white shadow-sm ${b.bg}`}
    >
      <Icon className="h-9 w-9 shrink-0" />
      <div>
        <h1 className="text-xl font-semibold leading-tight">{b.title}</h1>
        {subtitle && <p className="text-sm text-white/80">{subtitle}</p>}
      </div>
    </div>
  );
}
