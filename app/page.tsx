import { Overview } from "@/components/Overview";
import { ErrorPanel, MockNotice } from "@/components/Notice";
import { config } from "@/lib/config";
import { getOverview } from "@/lib/synthetics";
import type { CheckStatus } from "@/lib/types";

export const revalidate = 60;

export default async function Page() {
  let checks: CheckStatus[];
  try {
    checks = await getOverview();
  } catch (e) {
    return <ErrorPanel message={e instanceof Error ? e.message : String(e)} />;
  }

  const updated = `${new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  })} UTC`;

  return (
    <>
      {config.mock && <MockNotice />}
      <Overview checks={checks} updated={updated} />
    </>
  );
}
