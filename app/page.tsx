import { ErrorPanel, MockNotice } from "@/components/Notice";
import { Overview } from "@/components/Overview";
import { config } from "@/lib/config";
import { getOverview } from "@/lib/synthetics";
import type { OverviewData } from "@/lib/types";

export const revalidate = 60;

export default async function Page() {
  let data: OverviewData;
  try {
    data = await getOverview();
  } catch (e) {
    return <ErrorPanel message={e instanceof Error ? e.message : String(e)} />;
  }

  const { checks, fetchedAt } = data;

  // Derived from the data's fetch time, not render time, so it reflects when the
  // metrics were last refreshed even when the route regenerates more often.
  const updated = `${new Date(fetchedAt * 1000).toLocaleTimeString("en-GB", {
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
