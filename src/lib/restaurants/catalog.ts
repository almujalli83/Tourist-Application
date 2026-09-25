/**
 * Restaurant table booking adapter (MyTable / webook).
 *
 * Until the providers are connected, the sandbox catalogue below is served. Each restaurant
 * carries its booking policy from the provider: free booking, or a fee per guest that is deducted
 * from the bill, and the cancellation / change cut-off. The rest of the app only uses this module
 * for restaurant data, availability and the provider calls, so connecting the APIs means
 * replacing it.
 */
import { createHash, randomBytes } from "node:crypto";
import type { OpeningSlot, PlaceTag } from "../guide/types";

export const CUISINES = ["saudi", "hejazi", "seafood", "italian", "japanese", "lebanese", "indian", "turkish", "international", "cafe"] as const;
export type Cuisine = (typeof CUISINES)[number];

export interface RestaurantPolicy {
  /** Booking fee per guest in SAR (0 = free booking); deducted from the bill at the restaurant. */
  feePerGuestSAR: number;
  /** Cancellation (with a full refund of the fee) is possible until this many hours before. */
  cancelCutoffHours: number;
  /** Date, time and party size can be changed until this many hours before. */
  changeCutoffHours: number;
}

export interface Restaurant {
  id: string;
  provider: "mytable" | "webook";
  city: string;
  cuisine: Cuisine;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  addressAr: string;
  addressEn: string;
  lat: number;
  lng: number;
  /** 1 (budget) – 4 (fine dining). */
  priceLevel: number;
  rating: number;
  reviews: number;
  hours: OpeningSlot[];
  tags: PlaceTag[];
  /** Guests that can be seated per time slot. */
  coversPerSlot: number;
  maxParty: number;
  policy: RestaurantPolicy;
}

const daily = (open: string, close: string): OpeningSlot[] => [{ days: [0, 1, 2, 3, 4, 5, 6], open, close }];
const free = (cancel = 2, change = 2): RestaurantPolicy => ({ feePerGuestSAR: 0, cancelCutoffHours: cancel, changeCutoffHours: change });
const fee = (sar: number, cancel = 24, change = 12): RestaurantPolicy => ({ feePerGuestSAR: sar, cancelCutoffHours: cancel, changeCutoffHours: change });

const RESTAURANTS: Restaurant[] = [
  // Riyadh
  { id: "ruh-najd-heritage", provider: "mytable", city: "RUH", cuisine: "saudi", nameAr: "مطعم نجد التراثي", nameEn: "Najd Heritage Kitchen", descriptionAr: "أطباق نجدية تقليدية مثل الجريش والمرقوق والقرصان في جلسات تراثية.", descriptionEn: "Traditional Najdi dishes such as jareesh, marqooq and qursan in heritage-style seating.", addressAr: "حي السفارات، الرياض", addressEn: "Diplomatic Quarter, Riyadh", lat: 24.6835, lng: 46.6225, priceLevel: 2, rating: 4.6, reviews: 1840, hours: daily("12:30", "23:30"), tags: ["family", "womenSection"], coversPerSlot: 40, maxParty: 12, policy: free() },
  { id: "ruh-trattoria-diriyah", provider: "mytable", city: "RUH", cuisine: "italian", nameAr: "تراتوريا الدرعية", nameEn: "Trattoria Diriyah", descriptionAr: "مطبخ إيطالي بإطلالة على حي الطريف، بيتزا بفرن الحطب ومعكرونة طازجة.", descriptionEn: "Italian kitchen overlooking At-Turaif: wood-fired pizza and fresh pasta.", addressAr: "مطل البجيري، الدرعية", addressEn: "Bujairi Terrace, Diriyah", lat: 24.7349, lng: 46.5766, priceLevel: 3, rating: 4.5, reviews: 920, hours: daily("13:00", "23:30"), tags: ["family", "outdoor", "vegetarian"], coversPerSlot: 30, maxParty: 10, policy: fee(100) },
  { id: "ruh-kafd-omakase", provider: "webook", city: "RUH", cuisine: "japanese", nameAr: "أوماكاسي — المركز المالي", nameEn: "KAFD Omakase", descriptionAr: "تجربة أوماكاسي يابانية على طاولة الشيف بعدد مقاعد محدود.", descriptionEn: "A Japanese omakase experience at the chef's counter with limited seats.", addressAr: "مركز الملك عبدالله المالي، الرياض", addressEn: "King Abdullah Financial District, Riyadh", lat: 24.7662, lng: 46.6429, priceLevel: 4, rating: 4.8, reviews: 410, hours: daily("18:00", "23:30"), tags: ["indoor"], coversPerSlot: 12, maxParty: 6, policy: fee(250, 48, 24) },
  { id: "ruh-olaya-lebanese", provider: "mytable", city: "RUH", cuisine: "lebanese", nameAr: "بيت الأرز — العليا", nameEn: "Cedar House Olaya", descriptionAr: "مازات لبنانية ومشاوي على الفحم في قلب العليا.", descriptionEn: "Lebanese mezze and charcoal grills in the heart of Olaya.", addressAr: "شارع العليا، الرياض", addressEn: "Olaya Street, Riyadh", lat: 24.6985, lng: 46.6845, priceLevel: 2, rating: 4.4, reviews: 2310, hours: daily("12:00", "23:30"), tags: ["family", "vegetarian", "womenSection"], coversPerSlot: 60, maxParty: 15, policy: free() },
  // Jeddah
  { id: "jed-corniche-seafood", provider: "mytable", city: "JED", cuisine: "seafood", nameAr: "صيد اليوم — الكورنيش", nameEn: "Catch of the Day Corniche", descriptionAr: "مأكولات بحرية طازجة تختارها بنفسك وتُطهى على الطريقة الحجازية.", descriptionEn: "Fresh seafood you pick yourself, cooked the Hejazi way.", addressAr: "الكورنيش الشمالي، جدة", addressEn: "North Corniche, Jeddah", lat: 21.5874, lng: 39.1087, priceLevel: 3, rating: 4.6, reviews: 1560, hours: daily("13:00", "23:30"), tags: ["family", "seafood", "outdoor"], coversPerSlot: 50, maxParty: 14, policy: fee(50) },
  { id: "jed-albalad-hejazi", provider: "mytable", city: "JED", cuisine: "hejazi", nameAr: "بيت البلد الحجازي", nameEn: "Al-Balad Hejazi House", descriptionAr: "مطبخ حجازي أصيل (المنتو، السليق، المطبق) في بيت تاريخي بجدة القديمة.", descriptionEn: "Authentic Hejazi cuisine (mantu, saleeg, mutabbaq) in a historic house in old Jeddah.", addressAr: "جدة التاريخية", addressEn: "Historic Jeddah", lat: 21.4862, lng: 39.1875, priceLevel: 2, rating: 4.7, reviews: 980, hours: daily("12:00", "23:00"), tags: ["family", "indoor"], coversPerSlot: 35, maxParty: 12, policy: free(3, 3) },
  { id: "jed-bosphorus", provider: "webook", city: "JED", cuisine: "turkish", nameAr: "مطبخ البوسفور", nameEn: "Bosphorus Kitchen", descriptionAr: "أطباق تركية ومشاوي وحلويات على الطريقة العثمانية.", descriptionEn: "Turkish dishes, grills and Ottoman-style desserts.", addressAr: "حي الروضة، جدة", addressEn: "Al Rawdah, Jeddah", lat: 21.5627, lng: 39.1563, priceLevel: 2, rating: 4.3, reviews: 760, hours: daily("12:00", "23:30"), tags: ["family"], coversPerSlot: 45, maxParty: 12, policy: free() },
  // AlUla
  { id: "ulh-oasis-table", provider: "webook", city: "ULH", cuisine: "international", nameAr: "مائدة الواحة", nameEn: "Oasis Table", descriptionAr: "مطعم بين النخيل يقدم مكونات محلية من مزارع العُلا بلمسة عالمية.", descriptionEn: "A restaurant among the palms serving local AlUla farm produce with an international touch.", addressAr: "واحة العُلا", addressEn: "AlUla Oasis", lat: 26.6232, lng: 37.9205, priceLevel: 4, rating: 4.7, reviews: 530, hours: daily("12:00", "23:00"), tags: ["outdoor", "vegetarian"], coversPerSlot: 25, maxParty: 8, policy: fee(150, 48, 24) },
  { id: "ulh-oldtown-cafe", provider: "mytable", city: "ULH", cuisine: "cafe", nameAr: "مقهى البلدة القديمة", nameEn: "Old Town Café", descriptionAr: "قهوة سعودية وحلويات محلية بإطلالة على البلدة القديمة.", descriptionEn: "Saudi coffee and local sweets overlooking the old town.", addressAr: "البلدة القديمة، العُلا", addressEn: "Old Town, AlUla", lat: 26.6184, lng: 37.9162, priceLevel: 1, rating: 4.5, reviews: 640, hours: daily("09:00", "23:30"), tags: ["family", "outdoor"], coversPerSlot: 30, maxParty: 8, policy: free(1, 1) },
  // Eastern Province, Madinah, Abha
  { id: "dmm-khobar-seafood", provider: "mytable", city: "DMM", cuisine: "seafood", nameAr: "مرفأ الخبر", nameEn: "Khobar Harbour", descriptionAr: "مأكولات بحرية من الخليج العربي على الواجهة البحرية.", descriptionEn: "Arabian Gulf seafood on the waterfront.", addressAr: "كورنيش الخبر", addressEn: "Al Khobar Corniche", lat: 26.2952, lng: 50.2168, priceLevel: 3, rating: 4.5, reviews: 1120, hours: daily("13:00", "23:30"), tags: ["family", "seafood"], coversPerSlot: 45, maxParty: 12, policy: fee(50) },
  { id: "dmm-spice-route", provider: "webook", city: "DMM", cuisine: "indian", nameAr: "طريق التوابل", nameEn: "Spice Route", descriptionAr: "مطبخ هندي بأطباق التندور والكاري والخيارات النباتية.", descriptionEn: "Indian kitchen with tandoor dishes, curries and vegetarian options.", addressAr: "حي الشاطئ، الدمام", addressEn: "Al Shati, Dammam", lat: 26.4471, lng: 50.1112, priceLevel: 2, rating: 4.4, reviews: 870, hours: daily("12:00", "23:30"), tags: ["family", "vegetarian"], coversPerSlot: 50, maxParty: 14, policy: free() },
  { id: "med-quba-kitchen", provider: "mytable", city: "MED", cuisine: "saudi", nameAr: "مطبخ قباء", nameEn: "Quba Kitchen", descriptionAr: "مندي ومظبي وأطباق المدينة التقليدية قرب مسجد قباء.", descriptionEn: "Mandi, mathbi and traditional Madinah dishes near Quba Mosque.", addressAr: "قرب مسجد قباء، المدينة المنورة", addressEn: "Near Quba Mosque, Madinah", lat: 24.4412, lng: 39.6189, priceLevel: 1, rating: 4.6, reviews: 2040, hours: daily("12:00", "23:30"), tags: ["family", "womenSection"], coversPerSlot: 60, maxParty: 15, policy: free() },
  { id: "ahb-soudah-terrace", provider: "webook", city: "AHB", cuisine: "saudi", nameAr: "شرفة السودة", nameEn: "Soudah Terrace", descriptionAr: "أطباق عسيرية تقليدية بإطلالة على قمم السودة وضبابها.", descriptionEn: "Traditional Asiri dishes with views over the misty Soudah peaks.", addressAr: "السودة، أبها", addressEn: "Al Soudah, Abha", lat: 18.2703, lng: 42.3705, priceLevel: 2, rating: 4.5, reviews: 690, hours: daily("12:00", "22:30"), tags: ["family", "outdoor"], coversPerSlot: 35, maxParty: 12, policy: fee(30) },
];

export function listRestaurants(): Restaurant[] {
  return RESTAURANTS;
}

export const getRestaurant = (id: string) => RESTAURANTS.find((r) => r.id === id) ?? null;

/* ---------------------------------------------------------- slots */

export const BOOKING_DAYS_AHEAD = 30;
/** Bookings open until this long before the time slot. */
export const MIN_NOTICE_MINUTES = 60;
const SLOT_MINUTES = 30;
/** Last seating this long before closing. */
const LAST_SEATING_BEFORE_CLOSE = 60;

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

/** Seating times of a day (Saudi time), before midnight. */
export function seatingTimes(r: Restaurant, day: string): string[] {
  const wd = weekday(day);
  const out = new Set<string>();
  for (const h of r.hours) {
    if (!h.days.includes(wd)) continue;
    const open = toMin(h.open);
    let close = toMin(h.close);
    if (close <= open) close += 24 * 60;
    const last = Math.min(close - LAST_SEATING_BEFORE_CLOSE, 23 * 60 + 30);
    for (let m = Math.ceil(open / SLOT_MINUTES) * SLOT_MINUTES; m <= last; m += SLOT_MINUTES) out.add(toHHMM(m));
  }
  return [...out].sort();
}

/** ISO instant of a Saudi-time day + time. */
export const slotInstant = (day: string, time: string) => new Date(`${day}T${time}:00+03:00`).toISOString();

const unit = (s: string) => createHash("sha256").update(s).digest().readUInt32BE(0) / 0xffffffff;

/** Covers already booked through the provider's other channels (sandbox). */
export function providerBookedCovers(r: Restaurant, day: string, time: string): number {
  const peak = toMin(time) >= 19 * 60 && toMin(time) <= 21 * 60 + 30;
  return Math.floor(r.coversPerSlot * (peak ? 0.45 + 0.55 * unit(`${r.id}|${day}|${time}`) : 0.6 * unit(`${r.id}|${day}|${time}`)));
}

/* ---------------------------------------------------------- provider calls */

export const restaurantsProviderMode = () => "sandbox" as const;

export async function providerReserve(r: Restaurant): Promise<{ providerRef: string; code: string }> {
  const prefix = r.provider === "mytable" ? "MT" : "WB";
  return { providerRef: `${prefix}-${randomBytes(4).toString("hex").toUpperCase()}`, code: `${prefix}R-${randomBytes(6).toString("hex").toUpperCase()}` };
}

export async function providerChange(providerRef: string): Promise<boolean> {
  return !!providerRef;
}

export async function providerCancel(providerRef: string): Promise<boolean> {
  return !!providerRef;
}
