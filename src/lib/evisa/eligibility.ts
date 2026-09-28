/**
 * Tourist eVisa without a package (client-safe): open to the nationalities of North America,
 * Europe, China, Japan and Korea. Other nationalities apply through a tourism package (MT eVisa),
 * which needs a hotel and flights. EVISA_COUNTRIES (ISO alpha-2, comma-separated) replaces the list.
 */
export const DEFAULT_EVISA_COUNTRIES = [
  // North America
  "US", "CA", "MX",
  // Europe
  "GB", "IE", "FR", "DE", "IT", "ES", "PT", "NL", "BE", "LU", "CH", "AT", "SE", "NO", "DK", "FI", "PL", "CZ", "GR", "RO", "HU", "BG", "HR", "RU", "UA",
  // East Asia
  "CN", "HK", "JP", "KR",
] as const;

export function evisaCountries(): string[] {
  const env = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_EVISA_COUNTRIES ?? process.env.EVISA_COUNTRIES : undefined;
  const list = env?.split(",").map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c));
  return list?.length ? list : [...DEFAULT_EVISA_COUNTRIES];
}

export const evisaEligible = (nationality: string) => evisaCountries().includes(nationality.toUpperCase());
