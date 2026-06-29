import { STATUS_META } from "@/lib/format";
import type { Status } from "@/lib/types";

export function StatusBadge({ status, className = "" }: { status: Status; className?: string }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${m.color} ${className}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}
