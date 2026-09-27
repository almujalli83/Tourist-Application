/** Car rental: shared types (client-safe). */
export const CAR_CLASSES = ["economy", "sedan", "suv", "4x4", "luxury"] as const;
export type CarClass = (typeof CAR_CLASSES)[number];

export const RENTAL_EXTRAS = ["fullInsurance", "extraDriver", "childSeat", "gps"] as const;
export type RentalExtra = (typeof RENTAL_EXTRAS)[number];

/** Where the car is picked up or returned: the city's airport or a branch in the city. */
export type RentalSpot = "airport" | "city";

export interface RentalQuery {
  city: string;
  pickupSpot: RentalSpot;
  /** Return city (a one-way rental when it differs). */
  dropoffCity: string;
  dropoffSpot: RentalSpot;
  /** Saudi local "YYYY-MM-DDTHH:MM". */
  pickupAt: string;
  returnAt: string;
  driverAge: number;
  /** Country that issued the driving licence (ISO 3166 alpha-2). */
  licenceCountry: string;
}

export interface RentalQuote {
  quoteId: string;
  providerId: string;
  providerNameAr: string;
  providerNameEn: string;
  carClass: CarClass;
  /** Example model ("Toyota Yaris or similar"). */
  model: string;
  seats: number;
  bags: number;
  automatic: boolean;
  days: number;
  pricePerDaySAR: number;
  /** Rental for all days, before extras (one-way fee included). */
  totalSAR: number;
  oneWayFeeSAR: number;
  /** Held on the driver's card at pickup, returned after. */
  depositSAR: number;
  /** Kilometres included per day (null = unlimited). */
  kmPerDay: number | null;
  /** Price per rental of each extra the company offers (per day × days already applied). */
  extras: Partial<Record<RentalExtra, number>>;
  minAge: number;
  freeCancelHours: number;
  sandbox?: boolean;
}

export type RentalStatus = "requested" | "confirmed" | "rejected" | "cancelled" | "completed";

/** Where to collect the car, sent by the company once confirmed. */
export interface RentalCounter { name: string; phone: string; address: string }

export interface PublicRental extends RentalQuery {
  id: string;
  reference: string;
  bookingId: string | null;
  bookingReference: string | null;
  carClass: CarClass;
  model: string;
  seats: number;
  automatic: boolean;
  days: number;
  extras: RentalExtra[];
  /** Rental + chosen extras, paid at the counter. */
  totalSAR: number;
  depositSAR: number;
  kmPerDay: number | null;
  freeCancelHours: number;
  driverName: string;
  providerId: string;
  providerNameAr: string;
  providerNameEn: string;
  providerRef: string;
  /** The company's confirmation number and counter (once confirmed). */
  confirmation: string | null;
  counter: RentalCounter | null;
  status: RentalStatus;
  cancelReason: "traveller" | "packageCancelled" | "provider" | null;
  createdAt: string;
  updatedAt: string;
  sandbox?: boolean;
}

/** Whole rental days (24 h each, any started day counts). */
export function rentalDays(pickupAt: string, returnAt: string): number {
  const ms = Date.parse(`${returnAt}:00+03:00`) - Date.parse(`${pickupAt}:00+03:00`);
  return Math.max(1, Math.ceil(ms / 86_400_000 - 1 / 24)); // up to an hour late is not a new day
}

/** Cities where a car is advised: sites are far apart and ride apps scarce. */
export const CAR_ADVISED_CITIES = ["ULH", "AHB", "TUU", "HAS", "TIF"];

/** Driving in the Kingdom: short safety tips shown with every rental. */
export const DRIVING_TIPS = {
  ar: [
    "القيادة على الجهة اليمنى من الطريق.",
    "حزام الأمان إلزامي لجميع الركاب، ومقعد الأطفال للصغار.",
    "استخدام الجوال أثناء القيادة ممنوع.",
    "السرعة وإشارات المرور مراقبة بكاميرات نظام «ساهر»، والمخالفات تُسجَّل على السيارة.",
    "في الطرق الصحراوية والجبلية: املأ الوقود قبل الانطلاق، واحمل ماءً، وتجنّب القيادة ليلًا خارج المدن.",
    "عند وقوع حادث: توقّف في مكان آمن واتصل بـ«نجم» على 920000560 أو بالمرور 993، وفي الطوارئ 911.",
  ],
  en: [
    "Drive on the right-hand side of the road.",
    "Seat belts are mandatory for everyone, with child seats for young children.",
    "Using a phone while driving is prohibited.",
    "Speed and traffic lights are monitored by Saher cameras; fines are recorded against the car.",
    "On desert and mountain roads: fill up before setting off, carry water and avoid driving at night outside cities.",
    "After an accident: stop somewhere safe and call Najm on 920000560 or traffic on 993; in an emergency, 911.",
  ],
};
