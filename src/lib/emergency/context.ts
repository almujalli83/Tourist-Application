/** What the emergency page shows for the signed-in traveller: nationality and medical insurance. */
import type { PublicUser } from "../auth/types";
import { mtConfig } from "../config";
import { listBookingsByUser } from "../repo";

export interface EmergencyContext {
  /** Sandbox: a sample location (Riyadh) when the device location isn't available. */
  demo: boolean;
  nationality: string | null;
  /** Medical insurance of the current or next trip (issued with the visa). */
  insurance: { reference: string; departureDate: string; returnDate: string; travellers: { name: string; issued: boolean }[] } | null;
}

export async function emergencyContext(user: PublicUser | null, now = new Date()): Promise<EmergencyContext> {
  const demo = mtConfig().mock && process.env.DEMO_EMERGENCY !== "off";
  if (!user) return { demo, nationality: null, insurance: null };
  const today = new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
  const trip = (await listBookingsByUser(user.id))
    .filter((b) => b.status !== "CANCELLED" && b.mt.packageStatus !== "CANCELLED" && b.criteria.returnDate >= today)
    .sort((a, b) => a.criteria.departureDate.localeCompare(b.criteria.departureDate))[0];
  return {
    demo,
    nationality: user.individual?.nationality ?? trip?.criteria.nationality ?? null,
    insurance: trip
      ? {
          reference: trip.reference, departureDate: trip.criteria.departureDate, returnDate: trip.criteria.returnDate,
          travellers: trip.applicants.map((a) => ({ name: a.nameEn, issued: a.insuranceStatus === "ISSUED" })),
        }
      : null,
  };
}
