/**
 * International mobile numbers (ITU-T E.164). Numbers are stored as "+<country code><number>",
 * the format the MT eVisa API expects (max 15 characters). The national number length is
 * validated per country (mobile numbers, without the trunk prefix "0").
 */
import { COUNTRIES } from "./data/countries";

export interface PhoneRule {
  dial: string; // country calling code, digits only
  min: number; // national significant number length
  max: number;
}

/** Calling codes and mobile number lengths for every country offered in the app. */
export const PHONE_RULES: Record<string, PhoneRule> = {
  SA: { dial: "966", min: 9, max: 9 }, AE: { dial: "971", min: 9, max: 9 }, BH: { dial: "973", min: 8, max: 8 },
  KW: { dial: "965", min: 8, max: 8 }, OM: { dial: "968", min: 8, max: 8 }, QA: { dial: "974", min: 8, max: 8 },
  EG: { dial: "20", min: 10, max: 10 }, JO: { dial: "962", min: 9, max: 9 }, LB: { dial: "961", min: 7, max: 8 },
  SY: { dial: "963", min: 9, max: 9 }, IQ: { dial: "964", min: 10, max: 10 }, PS: { dial: "970", min: 9, max: 9 },
  YE: { dial: "967", min: 9, max: 9 }, SD: { dial: "249", min: 9, max: 9 }, LY: { dial: "218", min: 9, max: 9 },
  TN: { dial: "216", min: 8, max: 8 }, DZ: { dial: "213", min: 9, max: 9 }, MA: { dial: "212", min: 9, max: 9 },
  MR: { dial: "222", min: 8, max: 8 }, SO: { dial: "252", min: 7, max: 9 }, DJ: { dial: "253", min: 8, max: 8 },
  KM: { dial: "269", min: 7, max: 7 }, IN: { dial: "91", min: 10, max: 10 }, PK: { dial: "92", min: 10, max: 10 },
  BD: { dial: "880", min: 10, max: 10 }, LK: { dial: "94", min: 9, max: 9 }, NP: { dial: "977", min: 10, max: 10 },
  ID: { dial: "62", min: 9, max: 12 }, MY: { dial: "60", min: 9, max: 10 }, SG: { dial: "65", min: 8, max: 8 },
  BN: { dial: "673", min: 7, max: 7 }, TH: { dial: "66", min: 9, max: 9 }, PH: { dial: "63", min: 10, max: 10 },
  VN: { dial: "84", min: 9, max: 9 }, CN: { dial: "86", min: 11, max: 11 }, HK: { dial: "852", min: 8, max: 8 },
  JP: { dial: "81", min: 10, max: 10 }, KR: { dial: "82", min: 9, max: 10 }, KZ: { dial: "7", min: 10, max: 10 },
  UZ: { dial: "998", min: 9, max: 9 }, AZ: { dial: "994", min: 9, max: 9 }, TR: { dial: "90", min: 10, max: 10 },
  IR: { dial: "98", min: 10, max: 10 }, AF: { dial: "93", min: 9, max: 9 }, MV: { dial: "960", min: 7, max: 7 },
  RU: { dial: "7", min: 10, max: 10 }, UA: { dial: "380", min: 9, max: 9 }, GB: { dial: "44", min: 10, max: 10 },
  IE: { dial: "353", min: 9, max: 9 }, FR: { dial: "33", min: 9, max: 9 }, DE: { dial: "49", min: 10, max: 11 },
  IT: { dial: "39", min: 9, max: 10 }, ES: { dial: "34", min: 9, max: 9 }, PT: { dial: "351", min: 9, max: 9 },
  NL: { dial: "31", min: 9, max: 9 }, BE: { dial: "32", min: 9, max: 9 }, LU: { dial: "352", min: 9, max: 9 },
  CH: { dial: "41", min: 9, max: 9 }, AT: { dial: "43", min: 10, max: 11 }, SE: { dial: "46", min: 9, max: 9 },
  NO: { dial: "47", min: 8, max: 8 }, DK: { dial: "45", min: 8, max: 8 }, FI: { dial: "358", min: 9, max: 10 },
  PL: { dial: "48", min: 9, max: 9 }, CZ: { dial: "420", min: 9, max: 9 }, GR: { dial: "30", min: 10, max: 10 },
  RO: { dial: "40", min: 9, max: 9 }, HU: { dial: "36", min: 9, max: 9 }, BG: { dial: "359", min: 9, max: 9 },
  HR: { dial: "385", min: 8, max: 9 }, US: { dial: "1", min: 10, max: 10 }, CA: { dial: "1", min: 10, max: 10 },
  MX: { dial: "52", min: 10, max: 10 }, BR: { dial: "55", min: 11, max: 11 }, AR: { dial: "54", min: 10, max: 11 },
  AU: { dial: "61", min: 9, max: 9 }, NZ: { dial: "64", min: 8, max: 10 }, ZA: { dial: "27", min: 9, max: 9 },
  NG: { dial: "234", min: 10, max: 10 }, KE: { dial: "254", min: 9, max: 9 }, ET: { dial: "251", min: 9, max: 9 },
  SN: { dial: "221", min: 9, max: 9 },
};

/** MT accepts at most 15 characters ("+" plus 14 digits). */
export const MAX_PHONE_CHARS = 15;

export function flagEmoji(iso2: string): string {
  return [...iso2.toUpperCase()].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join("");
}

/** Digits only, without the national trunk prefix "0". */
export function cleanNational(input: string): string {
  return input.replace(/\D/g, "").replace(/^0+/, "");
}

export function formatE164(iso2: string, national: string): string {
  const rule = PHONE_RULES[iso2];
  const n = cleanNational(national);
  return rule && n ? `+${rule.dial}${n}` : "";
}

/** Splits a stored number into country and national part (prefers `hint` for shared codes like +1/+7). */
export function parsePhone(value: string, hint?: string): { iso2: string; national: string } | null {
  const digits = value.replace(/^00/, "+").replace(/[^\d+]/g, "");
  if (!digits.startsWith("+")) return null;
  const body = digits.slice(1);
  const matches = Object.entries(PHONE_RULES)
    .filter(([, r]) => body.startsWith(r.dial))
    .sort((a, b) => b[1].dial.length - a[1].dial.length);
  if (!matches.length) return null;
  const longest = matches[0][1].dial.length;
  const candidates = matches.filter(([, r]) => r.dial.length === longest);
  const chosen = candidates.find(([iso]) => iso === hint) ?? candidates[0];
  return { iso2: chosen[0], national: body.slice(chosen[1].dial.length) };
}

export type PhoneError = "required" | "mobile" | "mobileLength";

/** Validates a stored "+<code><number>" value against the country's number length. */
export function validatePhone(value: string, hint?: string): PhoneError | null {
  const v = value.replace(/[\s-]/g, "");
  if (!v) return "required";
  const parsed = parsePhone(v, hint);
  if (!parsed || !/^\d+$/.test(parsed.national)) return "mobile";
  const rules = Object.entries(PHONE_RULES).filter(([, r]) => r.dial === PHONE_RULES[parsed.iso2].dial).map(([, r]) => r);
  const len = parsed.national.length;
  const ok = rules.some((r) => len >= r.min && len <= r.max);
  if (!ok || v.length > MAX_PHONE_CHARS) return "mobileLength";
  return null;
}

/** Countries that have a phone rule, for the country-code picker. */
export function phoneCountries(locale: "ar" | "en") {
  return COUNTRIES.filter((c) => PHONE_RULES[c.iso2])
    .map((c) => ({ iso2: c.iso2, name: c[locale], dial: PHONE_RULES[c.iso2].dial }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}
