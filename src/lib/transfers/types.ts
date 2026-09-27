/** Airport transfers (meet & greet): shared types (client-safe). */
export const VEHICLES = ["sedan", "suv", "van", "vip"] as const;
export type Vehicle = (typeof VEHICLES)[number];
/** Seats and suitcases each class carries. */
export const VEHICLE_CAPACITY: Record<Vehicle, { pax: number; bags: number }> = {
  sedan: { pax: 3, bags: 3 }, suv: { pax: 6, bags: 6 }, van: { pax: 10, bags: 10 }, vip: { pax: 3, bags: 3 },
};
export type Direction = "arrival" | "departure";

/** The smallest vehicle that fits the party (VIP is always a choice, never the suggestion). */
export function suggestVehicle(pax: number, bags: number): Vehicle {
  return (["sedan", "suv", "van"] as const).find((v) => VEHICLE_CAPACITY[v].pax >= pax && VEHICLE_CAPACITY[v].bags >= bags) ?? "van";
}

export interface Place { name: string; lat: number | null; lng: number | null }

export interface TransferQuote {
  quoteId: string;
  providerId: string;
  providerNameAr: string;
  providerNameEn: string;
  vehicle: Vehicle;
  priceSAR: number;
  /** Free waiting after landing (arrivals). */
  freeWaitMins: number;
  /** Free cancellation until this many hours before pickup. */
  freeCancelHours: number;
  sandbox?: boolean;
}

export interface TransferExtras { childSeat: boolean; wheelchair: boolean; extraBags: number }

export type TransferStatus = "requested" | "confirmed" | "rejected" | "cancelled" | "completed";

export interface Driver { name: string; phone: string; car: string; plate: string }

export interface PublicTransfer {
  id: string;
  reference: string;
  bookingId: string | null;
  bookingReference: string | null;
  direction: Direction;
  airport: string;
  city: string;
  flightNo: string;
  /** Flight time (Saudi local "YYYY-MM-DDTHH:MM"): landing for arrivals, take-off for departures. */
  flightAt: string;
  /** Pickup time (Saudi local): landing time, or when to leave the hotel. */
  pickupAt: string;
  place: Place;
  pax: number;
  bags: number;
  vehicle: Vehicle;
  priceSAR: number;
  freeWaitMins: number;
  freeCancelHours: number;
  extras: TransferExtras;
  notes: string;
  leadName: string;
  providerId: string;
  providerNameAr: string;
  providerNameEn: string;
  providerRef: string;
  status: TransferStatus;
  driver: Driver | null;
  cancelReason: "traveller" | "packageCancelled" | "provider" | null;
  createdAt: string;
  updatedAt: string;
  sandbox?: boolean;
}
