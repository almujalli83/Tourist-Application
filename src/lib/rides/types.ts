/** Ride-hailing inside the platform: shared types (client-safe). */
export const RIDE_CATEGORIES = ["economy", "comfort", "family", "premium"] as const;
export type RideCategory = (typeof RIDE_CATEGORIES)[number];

export interface RidePoint { name: string; lat: number; lng: number }

export interface RideOption {
  optionId: string;
  providerId: string;
  providerNameAr: string;
  providerNameEn: string;
  color: string;
  category: RideCategory;
  /** The company's own product name ("UberX", "Go"…). */
  product: string;
  seats: number;
  minSAR: number;
  maxSAR: number;
  /** Minutes until a driver can reach the pickup. */
  etaMins: number;
  tripMins: number;
  sandbox?: boolean;
}

export type RideStatus = "searching" | "accepted" | "arriving" | "in_progress" | "completed" | "cancelled" | "no_driver";

export interface RideDriver { name: string; phone: string; car: string; plate: string; rating: number | null }

export interface PublicRide {
  id: string;
  reference: string;
  providerId: string;
  providerNameAr: string;
  providerNameEn: string;
  color: string;
  category: RideCategory;
  product: string;
  pickup: RidePoint;
  dropoff: RidePoint;
  minSAR: number;
  maxSAR: number;
  /** Final fare from the company once the ride ends. */
  fareSAR: number | null;
  status: RideStatus;
  driver: RideDriver | null;
  /** The driver's live position. */
  driverAt: { lat: number; lng: number } | null;
  etaMins: number | null;
  cancelReason: "traveller" | "provider" | "no_driver" | null;
  createdAt: string;
  updatedAt: string;
  sandbox?: boolean;
}

export const LIVE_RIDE: RideStatus[] = ["searching", "accepted", "arriving", "in_progress"];
