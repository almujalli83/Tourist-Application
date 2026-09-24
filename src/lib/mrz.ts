/**
 * ICAO 9303 TD3 (passport) Machine Readable Zone parser.
 * Used after OCR to auto-fill the visa application from a passport image.
 * Tolerates common OCR confusions by normalising characters per field type.
 */
import { countryFromIso3 } from "./data/countries";

export interface MrzResult {
  documentType: string;
  issuingCountry: string; // ISO2 (or raw code if unknown)
  familyName: string;
  givenNames: string[];
  passportNo: string;
  nationality: string; // ISO2 (or raw code if unknown)
  birthDate: string; // YYYY-MM-DD
  gender: "1" | "2" | "";
  expiryDate: string; // YYYY-MM-DD
  valid: { passportNo: boolean; birthDate: boolean; expiryDate: boolean; composite: boolean };
  confidence: number; // 0..1 share of valid check digits
}

const WEIGHTS = [7, 3, 1];

export function checkDigit(input: string): number {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    let v: number;
    if (ch >= "0" && ch <= "9") v = ch.charCodeAt(0) - 48;
    else if (ch >= "A" && ch <= "Z") v = ch.charCodeAt(0) - 55;
    else v = 0; // '<'
    sum += v * WEIGHTS[i % 3];
  }
  return sum % 10;
}

const TO_DIGIT: Record<string, string> = { O: "0", Q: "0", D: "0", I: "1", L: "1", Z: "2", S: "5", B: "8", G: "6", T: "7" };
const TO_ALPHA: Record<string, string> = { "0": "O", "1": "I", "2": "Z", "5": "S", "8": "B", "6": "G" };

/** Characters OCR commonly confuses in passport numbers. */
const CONFUSABLE: Record<string, string[]> = {
  "0": ["O", "D", "Q"], O: ["0", "D", "Q"], D: ["0", "O"], Q: ["0", "O"],
  "1": ["I", "L", "T"], I: ["1", "L"], L: ["1", "I"], T: ["1", "7"],
  "2": ["Z"], Z: ["2", "7"], "5": ["S"], S: ["5"], "8": ["B"], B: ["8"], "6": ["G"], G: ["6"], "7": ["T", "Z"],
};

const digits = (s: string) => s.replace(/[A-Z]/g, (c) => TO_DIGIT[c] ?? c);
const alpha = (s: string) => s.replace(/[0-9]/g, (c) => TO_ALPHA[c] ?? c);

/** Normalises raw OCR text lines into candidate 44-char MRZ lines. */
export function extractMrzLines(text: string): [string, string] | null {
  const lines = text
    .toUpperCase()
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, "").replace(/[«‹(]/g, "<").replace(/[^A-Z0-9<]/g, ""))
    .filter((l) => l.length >= 30);
  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i];
    if (!/^(P[A-Z<]|[A-Z0-9]?<[A-Z]{3})/.test(a) || !a.includes("<<")) continue;
    const b = lines[i + 1];
    return [normalizeLine1(a), normalizeLine2(b)];
  }
  // Fallback: the last two long lines (MRZ is at the bottom of the data page).
  if (lines.length >= 2) {
    const [a, b] = lines.slice(-2);
    if (a.includes("<<")) return [normalizeLine1(a), normalizeLine2(b)];
  }
  return null;
}

function fit(l: string): string {
  return l.length >= 44 ? l.slice(0, 44) : l.padEnd(44, "<");
}

/**
 * Line 1: OCR may misread or drop the leading "P" and compress the filler; the names are
 * delimited by "<<", so only the document code and country need fixed positions.
 */
function normalizeLine1(l: string): string {
  let x = l;
  if (/^<[A-Z]{3}/.test(x)) x = `P${x}`;
  else if (/^[A-Z0-9]<[A-Z]{3}/.test(x) && x[0] !== "P") x = `P${x.slice(1)}`;
  return fit(x);
}

/**
 * Line 2: the first 28 characters are fixed-width fields and the last is the composite check
 * digit; OCR often drops or adds "<" in the personal-number filler, so rebuild that field.
 */
function normalizeLine2(l: string): string {
  if (l.length === 44 || l.length < 30) return fit(l);
  const head = l.slice(0, 28);
  const last = l[l.length - 1];
  const personal = l.slice(28, l.length - 2);
  const personalCheck = l[l.length - 2];
  const fixed = personal.replace(/<+$/, "").padEnd(14, "<").slice(0, 14);
  return head + fixed + personalCheck + last;
}

function mrzDate(yymmdd: string, kind: "birth" | "expiry", now = new Date()): string {
  const yy = Number(yymmdd.slice(0, 2));
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  if (!/^\d{6}$/.test(yymmdd)) return "";
  const curYY = now.getUTCFullYear() % 100;
  let century: number;
  if (kind === "birth") century = yy > curYY ? 1900 : 2000;
  else century = yy >= 70 ? 1900 : 2000;
  const iso = `${century + yy}-${mm}-${dd}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : "";
}

/** OCR often reads the "<" filler as K, L or C; restore trailing filler after the names. */
function fixNameFiller(l1: string): string {
  return l1.replace(/<[<KLC]*$/, (m) => "<".repeat(m.length));
}

export function parseMrz(line1: string, line2: string, now = new Date()): MrzResult | null {
  const l1 = fixNameFiller(fit(line1.toUpperCase()));
  let l2 = fit(line2.toUpperCase());
  if (l1[0] !== "P") return null;

  const issuingRaw = alpha(l1.slice(2, 5));
  const names = alpha(l1.slice(5)).replace(/<+$/, "");
  const [familyRaw, givenRaw = ""] = names.split("<<");
  const familyName = familyRaw.replace(/<+/g, " ").trim();
  const givenNames = givenRaw.split("<").map((s) => s.trim()).filter(Boolean);

  const passportField = l2.slice(0, 9);
  const passportCheck = digits(l2[9]);
  const nationalityRaw = alpha(l2.slice(10, 13));
  const birthField = digits(l2.slice(13, 19));
  const birthCheck = digits(l2[19]);
  const sexChar = l2[20];
  const expiryField = digits(l2.slice(21, 27));
  const expiryCheck = digits(l2[27]);
  let personal = l2.slice(28, 43);
  const compositeCheck = digits(l2[43]);

  // Passport numbers are alphanumeric; try the raw value, then a digit-normalised one.
  let passportNo = passportField;
  let passportRepaired = false;
  let passportOk = String(checkDigit(passportField)) === passportCheck;
  if (!passportOk) {
    const alt = passportField.slice(0, 2) + digits(passportField.slice(2));
    if (String(checkDigit(alt)) === passportCheck) {
      passportNo = alt;
      passportOk = true;
    }
  }

  if (!passportOk) {
    // Try single swaps of look-alike characters; accept only an unambiguous fix.
    const fixes = new Set<string>();
    for (let i = 0; i < passportField.length; i++) {
      for (const alt of CONFUSABLE[passportField[i]] ?? []) {
        const cand = passportField.slice(0, i) + alt + passportField.slice(i + 1);
        if (String(checkDigit(cand)) === passportCheck) fixes.add(cand);
      }
    }
    // A mod-10 check digit alone can be satisfied by a wrong swap, so only accept a single
    // candidate with the usual passport-number shape (optional leading letters, then digits).
    const plausible = [...fixes].filter((f) => /^[A-Z]{0,2}[0-9]+<*$/.test(f));
    if (plausible.length === 1) {
      passportNo = plausible[0];
      passportOk = true;
      passportRepaired = true;
    }
  }

  const birthOk = String(checkDigit(birthField)) === birthCheck;
  const expiryOk = String(checkDigit(expiryField)) === expiryCheck;
  const composite = (p: string) => passportNo + passportCheck + birthField + birthCheck + expiryField + expiryCheck + p;
  let compositeOk = String(checkDigit(composite(personal))) === compositeCheck;
  if (!compositeOk) {
    // The optional personal-number field is usually all filler; retry with misread filler restored.
    const alt = personal.replace(/[KLC]/g, "<");
    if (String(checkDigit(composite(alt))) === compositeCheck) {
      personal = alt;
      compositeOk = true;
      l2 = l2.slice(0, 28) + alt + l2.slice(43);
    }
  }

  const issuing = countryFromIso3(issuingRaw);
  const nationality = countryFromIso3(nationalityRaw);
  const valid = { passportNo: passportOk, birthDate: birthOk, expiryDate: expiryOk, composite: compositeOk };

  return {
    documentType: l1.slice(0, 2).replace(/</g, ""),
    issuingCountry: issuing?.iso2 ?? issuingRaw.replace(/</g, ""),
    familyName,
    givenNames,
    passportNo: passportNo.replace(/</g, ""),
    nationality: nationality?.iso2 ?? nationalityRaw.replace(/</g, ""),
    birthDate: mrzDate(birthField, "birth", now),
    gender: sexChar === "M" ? "1" : sexChar === "F" ? "2" : "",
    expiryDate: mrzDate(expiryField, "expiry", now),
    valid,
    // A repaired passport number is filled in but flagged for review (never counted as certain).
    confidence: (Object.values(valid).filter(Boolean).length - (passportRepaired ? 1 : 0)) / 4,
  };
}

export function parseMrzText(text: string, now = new Date()): MrzResult | null {
  const lines = extractMrzLines(text);
  return lines ? parseMrz(lines[0], lines[1], now) : null;
}
