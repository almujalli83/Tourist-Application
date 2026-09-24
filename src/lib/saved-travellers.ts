/**
 * Saved travellers ("My travellers"): the reusable, trip-independent part of a traveller's visa
 * data. Security and insurance answers, sponsorship and passenger type are never saved — they
 * belong to each trip. Shared by the API (sanitising, validation) and the UI.
 */
import { addMonths, ageOn, diffDays, isValidISODate } from "./dates";
import { PACKAGE_LIMITS } from "./config";
import type { PaxType, Traveller } from "./types";
import { emptyTraveller, validateTraveller, type FieldErrors } from "./visa-validation";

export const SAVED_TEXT_FIELDS = [
  "firstNameEn", "middleNameEn", "grandFatherNameEn", "familyNameEn",
  "firstNameAr", "middleNameAr", "grandFatherNameAr", "familyNameAr",
  "birthDate", "birthplace", "gender", "job", "nationality",
  "passportNo", "passportType", "passportIssueDate", "passportExpiryDate", "passportIssuePlace",
  "religion", "maritalStatus", "email", "mobileNo", "zipCode",
] as const;
export const SAVED_IMAGE_FIELDS = ["personPhoto", "passportImage"] as const;
export const SAVED_FIELDS = [...SAVED_TEXT_FIELDS, ...SAVED_IMAGE_FIELDS] as const;

export type SavedTravellerData = Pick<Traveller, (typeof SAVED_FIELDS)[number]>;
export interface SavedTraveller extends SavedTravellerData {
  id: string;
  updatedAt: string;
}

/** What lists show: no images, passport number masked. */
export interface SavedTravellerSummary {
  id: string;
  nameEn: string;
  nameAr: string;
  nationality: string;
  birthDate: string;
  gender: Traveller["gender"];
  passportNoMasked: string;
  passportExpiryDate: string;
  hasPhoto: boolean;
  hasPassportImage: boolean;
  updatedAt: string;
}

/** Fields a saved traveller must have; the rest may be completed during a booking. */
const REQUIRED_TO_SAVE = new Set(["firstNameEn", "familyNameEn", "nationality", "passportNo"]);
const ENUMS: Partial<Record<(typeof SAVED_TEXT_FIELDS)[number], string[]>> = {
  gender: ["", "1", "2"],
  passportType: ["1", "2", "3"],
  religion: ["", "1", "2"],
  maritalStatus: ["", "1", "2", "3", "4", "5"],
};
const IMAGE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGE_CHARS = 1.5 * 1024 * 1024; // ≈1.1 MB decoded; the per-field limits are validated below
export const MAX_SAVED_TRAVELLERS = 200;

export function pickSavedData(t: Partial<Traveller>): SavedTravellerData {
  const out = {} as Record<string, string>;
  for (const k of SAVED_FIELDS) out[k] = typeof t[k] === "string" ? (t[k] as string) : "";
  return out as unknown as SavedTravellerData;
}

/** Coerces untrusted input into saved-traveller data (unknown keys dropped, sizes capped). */
export function sanitizeSavedTraveller(input: unknown): SavedTravellerData {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out = {} as Record<string, string>;
  for (const k of SAVED_TEXT_FIELDS) {
    const v = typeof src[k] === "string" ? (src[k] as string).trim().slice(0, 60) : "";
    const allowed = ENUMS[k];
    out[k] = allowed && !allowed.includes(v) ? allowed[0] : v;
  }
  for (const k of SAVED_IMAGE_FIELDS) {
    const v = typeof src[k] === "string" ? (src[k] as string) : "";
    out[k] = v.length <= MAX_IMAGE_CHARS && IMAGE.test(v) ? v : "";
  }
  return out as unknown as SavedTravellerData;
}

export function paxTypeOn(birthDate: string, on: string): PaxType {
  if (!isValidISODate(birthDate)) return "adult";
  const age = ageOn(birthDate, on);
  return age >= 12 ? "adult" : age >= 2 ? "child" : "infant";
}

/**
 * Validates saved data with the visa rules, trip-independently: only the core fields are
 * mandatory, and the passport has only to be unexpired (trip validity is checked when booking).
 */
export function validateSavedTraveller(d: SavedTravellerData, today: string): FieldErrors {
  // Arriving six months ago makes the "valid ≥ 6 months after arrival" rule mean "not expired".
  const arrivalDate = addMonths(today, -PACKAGE_LIMITS.passportValidityMonths);
  const t: Traveller = { ...emptyTraveller(paxTypeOn(d.birthDate, arrivalDate), d.nationality), ...d, sponsorIndex: null };
  const all = validateTraveller(t, 0, [t], { arrivalDate, returnDate: arrivalDate, today, travellerCount: 1 });
  const out: FieldErrors = {};
  for (const k of SAVED_FIELDS) {
    const err = all[k];
    if (!err || (err === "required" && !REQUIRED_TO_SAVE.has(k))) continue;
    out[k] = err === "passportValidity" ? "passportExpired" : err;
  }
  return out;
}

export function summarize(id: string, d: SavedTravellerData, updatedAt: string): SavedTravellerSummary {
  const pn = d.passportNo;
  return {
    id,
    nameEn: [d.firstNameEn, d.middleNameEn, d.grandFatherNameEn, d.familyNameEn].filter(Boolean).join(" "),
    nameAr: [d.firstNameAr, d.middleNameAr, d.grandFatherNameAr, d.familyNameAr].filter(Boolean).join(" "),
    nationality: d.nationality,
    birthDate: d.birthDate,
    gender: d.gender,
    passportNoMasked: pn.length > 4 ? `•••${pn.slice(-4)}` : pn,
    passportExpiryDate: d.passportExpiryDate,
    hasPhoto: !!d.personPhoto,
    hasPassportImage: !!d.passportImage,
    updatedAt,
  };
}

export type PassportStatus = "ok" | "insufficient" | "expired" | "unknown";

/** Whether the passport is usable for a trip arriving on `arrivalDate` (valid ≥ 6 months after). */
export function passportStatus(expiry: string, today: string, arrivalDate?: string): PassportStatus {
  if (!isValidISODate(expiry)) return "unknown";
  if (diffDays(today, expiry) < 0) return "expired";
  const ref = arrivalDate && isValidISODate(arrivalDate) ? arrivalDate : today;
  return diffDays(addMonths(ref, PACKAGE_LIMITS.passportValidityMonths), expiry) < 0 ? "insufficient" : "ok";
}
