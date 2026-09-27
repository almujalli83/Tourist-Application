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
  const mins = Math.max(5, Math.round(4 + km * 1.8));
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
