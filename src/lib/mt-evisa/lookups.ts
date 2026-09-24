/**
 * Sandbox lookup values mirroring the MT lookup APIs (§5). In live mode these are fetched
 * from MT and matched by `code` (ISO2 for countries, city codes, airport codes).
 */
import { COUNTRIES } from "../data/countries";
import { SAUDI_CITIES } from "../data/cities";
import type { MtLookupItem, MtLookupName } from "./types";

const countryItems: MtLookupItem[] = COUNTRIES.map((c, i) => ({ id: String(i + 1), code: c.iso2, enValue: c.en }));

export const COMPANION_TYPES: { code: string; en: string; ar: string }[] = [
  { code: "SPOUSE", en: "Spouse", ar: "زوج / زوجة" },
  { code: "SON", en: "Son", ar: "ابن" },
  { code: "DAUGHTER", en: "Daughter", ar: "ابنة" },
  { code: "FATHER", en: "Father", ar: "أب" },
  { code: "MOTHER", en: "Mother", ar: "أم" },
  { code: "RELATIVE", en: "Other relative", ar: "قريب" },
  { code: "FRIEND", en: "Friend", ar: "صديق" },
];

export const SANDBOX_LOOKUPS: Record<MtLookupName, MtLookupItem[]> = {
  getbirthPlace: countryItems,
  getNationality: countryItems,
  getPassportIssuePlace: countryItems,
  getCompanionType: COMPANION_TYPES.map((c, i) => ({ id: String(i + 1), code: c.code, enValue: c.en })),
  getCity: SAUDI_CITIES.map((c, i) => ({ id: String(i + 1), code: c.mtCityCode, enValue: c.en })),
  getEntryPort: SAUDI_CITIES.map((c, i) => ({ id: String(i + 1), code: c.code, enValue: `${c.en} - ${c.airportEn} (Airport)` })),
  getExitPort: SAUDI_CITIES.map((c, i) => ({ id: String(i + 1), code: c.code, enValue: `${c.en} - ${c.airportEn} (Airport)` })),
};

/** Resolves an app code (ISO2, city code, airport code) to the MT lookup id. */
export function lookupId(items: MtLookupItem[], code: string): string {
  const hit = items.find((i) => i.code.toUpperCase() === code.toUpperCase());
  if (!hit) throw new Error(`MT lookup value not found for code "${code}"`);
  return hit.id;
}
