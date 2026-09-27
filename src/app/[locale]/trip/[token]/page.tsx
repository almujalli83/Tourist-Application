import type { Metadata } from "next";
import { SharedTripView } from "@/components/shared-trip-view";
import { sharedTrip } from "@/lib/family/share";

export const metadata: Metadata = { referrer: "no-referrer", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SharedTripPage({ params }: { params: Promise<{ token: string }> }) {
  const trip = await sharedTrip((await params).token).catch(() => null);
  return <SharedTripView trip={trip} />;
}
