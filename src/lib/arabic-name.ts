/**
 * Extracts the Arabic full name printed on a passport data page (Arab passports print it in
 * the visual zone; the MRZ only carries the Latin name) and splits it into the four parts
 * the eVisa requires: first, father, grandfather and family name.
 */

const ARABIC_WORD = /^[ء-ي]+$/;
const DIACRITICS = /[ً-ٰٟـ]/g; // harakat + tatweel
const CONNECTORS = new Set(["بن", "بنت", "ابن", "ابنة", "إبن"]);
const LABELS = ["الاسم", "الإسم", "اسم"];
const NOT_A_NAME = [
  "المملكة", "العربية", "السعودية", "جمهورية", "دولة", "جواز", "سفر", "تاريخ", "الميلاد", "الإصدار",
  "الاصدار", "الانتهاء", "مكان", "جهة", "الجنسية", "الرقم", "النوع", "رقم", "الجوازات", "المهنة",
];

function words(line: string): string[] {
  return line
    .replace(DIACRITICS, "")
    .replace(/[^ء-ي\s]/g, " ")
    .split(/\s+/)
    .filter((w) => ARABIC_WORD.test(w));
}

/** Returns the most likely Arabic full name in OCR text, or null. */
export function extractArabicName(text: string): string | null {
  const candidates: { name: string[]; score: number }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let w = words(raw);
    const labelAt = w.findIndex((x) => LABELS.includes(x));
    const labelled = labelAt >= 0;
    if (labelled) w = w.slice(labelAt + 1);
    if (w.some((x) => NOT_A_NAME.includes(x))) continue;
    const parts = w.filter((x) => !CONNECTORS.has(x) && x.length >= 2);
    if (parts.length < 2 || parts.length > 6) continue;
    const hasConnector = w.some((x) => CONNECTORS.has(x));
    if (!labelled && !hasConnector) continue;
    candidates.push({ name: w, score: (labelled ? 2 : 0) + (hasConnector ? 1 : 0) + Math.min(parts.length, 4) / 10 });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ? candidates[0].name.join(" ") : null;
}

export interface ArabicNameParts {
  firstNameAr: string;
  middleNameAr: string;
  grandFatherNameAr: string;
  familyNameAr: string;
}

/** "رشيد بن محمد بن رشيد المجلي" → first رشيد, father محمد, grandfather رشيد, family المجلي. */
export function splitArabicName(full: string): ArabicNameParts | null {
  let w = words(full);
  // With "بن" chains the first name is the word right before the first connector; anything
  // earlier is a misread label (e.g. "الاسم").
  const firstConnector = w.findIndex((x) => CONNECTORS.has(x));
  if (firstConnector > 1) w = w.slice(firstConnector - 1);
  const parts = w.filter((x) => !CONNECTORS.has(x));
  if (parts.length < 2) return null;
  const clip = (s: string) => (s.length > 15 ? "" : s);
  const first = parts[0];
  const family = parts[parts.length - 1];
  const father = parts.length >= 3 ? parts[1] : "";
  const grandfather = parts.length >= 4 ? parts.slice(2, -1).join(" ") : "";
  if (!clip(first) || !clip(family)) return null;
  return { firstNameAr: first, middleNameAr: clip(father), grandFatherNameAr: clip(grandfather), familyNameAr: family };
}

/* ------------------------------------------------------------------ cross-check with MRZ */

const AR_MAP: Record<string, string> = {
  ب: "B", ت: "T", ث: "T", ج: "J", ح: "H", خ: "X", د: "D", ذ: "D", ر: "R", ز: "Z", س: "S", ش: "$",
  ص: "S", ض: "D", ط: "T", ظ: "D", غ: "G", ف: "F", ق: "K", ك: "K", ل: "L", م: "M", ن: "N", ه: "H",
};

/** Consonant skeleton of an Arabic name (vowels, ع, ء and weak letters dropped, doubles collapsed). */
export function arabicSkeleton(name: string): string {
  // Collapse only repeats of the same Arabic letter (e.g. "لل"); two different letters that map
  // to one class (e.g. "طت") are kept, so an extra misread letter lowers the similarity.
  const letters = [...name.replace(DIACRITICS, "")].filter((c, i, a) => c !== a[i - 1]);
  return letters.map((c) => AR_MAP[c] ?? "").join("");
}

/** Consonant skeleton of a Latin (MRZ) name, comparable with arabicSkeleton. */
export function latinSkeleton(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .replace(/KH/g, "X").replace(/SH/g, "$").replace(/TH/g, "T").replace(/DH/g, "D").replace(/GH/g, "G").replace(/PH/g, "F")
    .replace(/[CQ]/g, "K").replace(/G/g, "J").replace(/[AEIOUWY]/g, "")
    .replace(/(.)\1+/g, "$1");
}

function levenshtein(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** 0..1 similarity between an Arabic name and its Latin (MRZ) spelling. */
export function nameSimilarity(arabic: string, latin: string): number {
  const a = arabicSkeleton(arabic);
  const b = latinSkeleton(latin);
  // Arabic ج and غ/ق are written G or J/K in Latin; compare with both readings.
  const variants = [b, b.replace(/J/g, "G"), b.replace(/J/g, "K")];
  const best = Math.max(...variants.map((v) => 1 - levenshtein(a, v) / Math.max(a.length, v.length, 1)));
  return best;
}

/**
 * Accepts an Arabic name read by OCR only if it agrees with the MRZ Latin name (which is
 * validated by check digits): first and family names must match closely.
 */
export function verifyArabicName(parts: ArabicNameParts, mrz: { givenNames: string[]; familyName: string }): boolean {
  const given = mrz.givenNames;
  if (!given[0] || !mrz.familyName) return false;
  const family = mrz.familyName.split(" ").join("");
  if (nameSimilarity(parts.firstNameAr, given[0]) < 0.75) return false;
  if (nameSimilarity(parts.familyNameAr, family) < 0.75) return false;
  if (parts.middleNameAr && given[1] && given[1].length > 1 && nameSimilarity(parts.middleNameAr, given[1]) < 0.6) return false;
  return true;
}

/** Fixes frequent OCR confusions in names: "عبداللة" → "عبدالله", "المطيرى" → "المطيري". */
export function normalizeArabicNamePart(w: string): string {
  let x = w;
  if (x.includes("الل") && x.endsWith("لة")) x = `${x.slice(0, -1)}ه`;
  if (x.startsWith("ال") && x.endsWith("ى")) x = `${x.slice(0, -1)}ي`;
  return x;
}

const KEYS = ["firstNameAr", "middleNameAr", "grandFatherNameAr", "familyNameAr"] as const;

/**
 * Combines several OCR readings of the Arabic name: keeps readings that agree with the MRZ,
 * votes per name part, and drops any part that does not match its Latin counterpart.
 */
export function reconcileArabicName(
  readings: ArabicNameParts[],
  mrz: { givenNames: string[]; familyName: string },
): ArabicNameParts | null {
  const verified = readings
    .map((r) => Object.fromEntries(KEYS.map((k) => [k, r[k] ? normalizeArabicNamePart(r[k]) : ""])) as unknown as ArabicNameParts)
    .filter((r) => verifyArabicName(r, mrz));
  if (!verified.length) return null;

  const latinFor: Record<(typeof KEYS)[number], string | undefined> = {
    firstNameAr: mrz.givenNames[0],
    middleNameAr: mrz.givenNames[1],
    grandFatherNameAr: mrz.givenNames.slice(2).join(""),
    familyNameAr: mrz.familyName.split(" ").join(""),
  };
  const result = {} as ArabicNameParts;
  for (const k of KEYS) {
    const counts = new Map<string, number>();
    for (const r of verified) if (r[k]) counts.set(r[k], (counts.get(r[k]) ?? 0) + 1);
    const latin = latinFor[k];
    const ls = latin ? latinSkeleton(latin) : "";
    // Truncated MRZ names (e.g. "F") only give the first consonant.
    const initialOk = (v: string) => {
      const as = arabicSkeleton(v.split(" ")[0]);
      return !ls || as[0] === ls[0] || (ls[0] === "J" && "GK".includes(as[0]));
    };
    const score = (v: string) => (!latin ? 0 : ls.length <= 1 ? Number(initialOk(v)) : nameSimilarity(v, latin));
    // Prefer the reading closest to the MRZ spelling; break ties by how many readings agree.
    const ranked = [...counts.entries()].sort((a, b) => score(b[0]) - score(a[0]) || b[1] - a[1]);
    let value = ranked[0]?.[0] ?? "";
    if (value && latin) {
      // Long Latin names must match closely; initials must share the first consonant.
      // Correct names score 1.0 against their MRZ spelling; OCR misreads score ≤ 0.8.
      const ok = ls.length <= 1 ? initialOk(value) : nameSimilarity(value, latin) >= 0.85;
      if (!ok) value = "";
    }
    result[k] = value;
  }
  // Parts that could not be confirmed stay empty for the traveller to type.
  return KEYS.some((k) => result[k]) ? result : null;
}
