/**
 * Ride-hailing (client-safe): open Uber, Careem or Jeeny for a destination, with an approximate
 * fare and time. Uber supports a universal link with the destination filled in; Careem and Jeeny
 * publish no such link, so their app (store page) opens and the destination is copied to paste.
 * The estimate is indicative only — the final price is the one shown in the app.
 */
import { distanceKm } from "../guide/geo";

export type RideApp = "uber" | "careem" | "jeeny";
export const RIDE_APPS: RideApp[] = ["uber", "careem", "jeeny"];
export const RIDE_APP_NAMES: Record<RideApp, [string, string]> = { uber: ["أوبر", "Uber"], careem: ["كريم", "Careem"], jeeny: ["جيني", "Jeeny"] };

export interface RideDestination { lat: number; lng: number; name: string }
export type Platform = "ios" | "android" | "other";

const STORE: Record<Exclude<RideApp, "uber">, Record<Platform, string>> = {
  careem: {
    ios: "https://apps.apple.com/app/careem/id592978487",
    android: "https://play.google.com/store/apps/details?id=com.careem.acma",
    other: "https://www.careem.com/",
  },
  jeeny: {
    ios: "https://apps.apple.com/app/jeeny/id1178701124",
    android: "https://play.google.com/store/apps/details?id=me.com.easytaxi",
    other: "https://www.jeeny.me/",
  },
};

export function platformOf(userAgent: string): Platform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

/** The link that opens the app; `direct` = the destination is already filled in. */
export function rideLink(app: RideApp, to: RideDestination, platform: Platform): { href: string; direct: boolean } {
  if (app === "uber") {
    const q = new URLSearchParams({
      action: "setPickup", "pickup": "my_location",
      "dropoff[latitude]": String(to.lat), "dropoff[longitude]": String(to.lng), "dropoff[nickname]": to.name,
    });
    return { href: `https://m.uber.com/ul/?${q}`, direct: true };
  }
  return { href: STORE[app][platform], direct: false };
}

/** Text copied for apps without a destination link: the name and a map link of the place. */
export const destinationText = (to: RideDestination) => `${to.name} — https://maps.google.com/?q=${to.lat},${to.lng}`;

/** Indicative city tariff (SAR): flag fall, per km, per minute, minimum fare. */
export const TARIFF = { base: 8, perKm: 1.8, perMin: 0.4, minimum: 15 } as const;
/** Straight-line distance → road distance. */
const ROAD_FACTOR = 1.3;
/** Walking is suggested up to this distance (km, straight line). */
export const WALK_MAX_KM = 0.9;

export interface RideEstimate {
  km: number;
  mins: number;
  minSAR: number;
  maxSAR: number;
}

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

/** Approximate ride time and fare range for a straight-line distance. */
export function estimateFromKm(straightKm: number): RideEstimate {
  const km = Math.round(straightKm * ROAD_FACTOR * 10) / 10;
  // City traffic for the first 10 km, faster roads beyond (airport runs, between districts).
  const mins = Math.max(5, Math.round(4 + Math.min(km, 10) * 1.8 + Math.max(0, km - 10) * 0.75));
  const fare = Math.max(TARIFF.minimum, TARIFF.base + km * TARIFF.perKm + mins * TARIFF.perMin);
  return { km, mins, minSAR: round5(fare * 0.85), maxSAR: Math.max(round5(fare * 0.85) + 5, round5(fare * 1.2)) };
}

export const estimateRide = (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => estimateFromKm(distanceKm(from, to));

/** How to get from one place to the next in a day: on foot when close, otherwise by car. */
export function legBetween(from: { lat: number; lng: number }, to: { lat: number; lng: number }): { mode: "walk"; mins: number; km: number } | ({ mode: "car" } & RideEstimate) {
  const km = distanceKm(from, to);
  if (km <= WALK_MAX_KM) return { mode: "walk", km: Math.round(km * ROAD_FACTOR * 10) / 10, mins: Math.max(2, Math.round((km * ROAD_FACTOR * 1000) / 80)) };
  return { mode: "car", ...estimateFromKm(km) };
}

/** Airports (IATA) with their location. */
export const AIRPORTS: Record<string, { lat: number; lng: number }> = {
  RUH: { lat: 24.9576, lng: 46.6988 }, JED: { lat: 21.6796, lng: 39.1565 }, MED: { lat: 24.5534, lng: 39.7051 },
  DMM: { lat: 26.4712, lng: 49.7979 }, AHB: { lat: 18.2404, lng: 42.6566 }, ULH: { lat: 26.4834, lng: 38.117 },
  TIF: { lat: 21.4834, lng: 40.5443 }, TUU: { lat: 28.3654, lng: 36.6189 }, HOF: { lat: 25.2853, lng: 49.4852 },
  YNB: { lat: 24.1442, lng: 38.0634 }, ELQ: { lat: 26.3028, lng: 43.7744 }, GIZ: { lat: 16.9011, lng: 42.5858 },
};

