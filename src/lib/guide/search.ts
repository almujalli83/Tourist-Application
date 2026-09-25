/** Search helpers shared by the server and the guide page (no server-only imports). */
import type { Place } from "./types";

/** Arabic/Latin search normalisation: diacritics, alef/ya/ta-marbuta variants, tatweel, case. */
export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/^ال|\sال/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function matchesQuery(p: Pick<Place, "nameAr" | "nameEn" | "descriptionAr" | "descriptionEn" | "cuisineAr" | "cuisineEn" | "addressAr" | "addressEn">, q: string): boolean {
  const needle = normalizeSearch(q);
  if (!needle) return true;
  const hay = normalizeSearch([p.nameAr, p.nameEn, p.descriptionAr, p.descriptionEn, p.cuisineAr, p.cuisineEn, p.addressAr, p.addressEn].filter(Boolean).join(" "));
  return needle.split(" ").every((w) => hay.includes(w));
}
