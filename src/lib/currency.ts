/**
 * Multi-currency support. All prices are stored and charged in SAR (the settlement
 * currency with MT and the travel agents); other currencies are for display.
 * Rates are "units of currency per 1 SAR" and can be refreshed from a rates provider.
 */
export const BASE_CURRENCY = "SAR";

export interface CurrencyInfo {
  code: string;
  nameEn: string;
  nameAr: string;
  symbolEn: string;
  symbolAr: string;
  decimals: number;
  perSAR: number;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: "SAR", nameEn: "Saudi Riyal", nameAr: "ريال سعودي", symbolEn: "SAR", symbolAr: "ر.س", decimals: 2, perSAR: 1 },
  { code: "USD", nameEn: "US Dollar", nameAr: "دولار أمريكي", symbolEn: "$", symbolAr: "$", decimals: 2, perSAR: 0.2667 },
  { code: "EUR", nameEn: "Euro", nameAr: "يورو", symbolEn: "€", symbolAr: "€", decimals: 2, perSAR: 0.2451 },
  { code: "GBP", nameEn: "British Pound", nameAr: "جنيه إسترليني", symbolEn: "£", symbolAr: "£", decimals: 2, perSAR: 0.2083 },
  { code: "AED", nameEn: "UAE Dirham", nameAr: "درهم إماراتي", symbolEn: "AED", symbolAr: "د.إ", decimals: 2, perSAR: 0.9793 },
  { code: "KWD", nameEn: "Kuwaiti Dinar", nameAr: "دينار كويتي", symbolEn: "KWD", symbolAr: "د.ك", decimals: 3, perSAR: 0.0818 },
  { code: "BHD", nameEn: "Bahraini Dinar", nameAr: "دينار بحريني", symbolEn: "BHD", symbolAr: "د.ب", decimals: 3, perSAR: 0.1005 },
  { code: "QAR", nameEn: "Qatari Riyal", nameAr: "ريال قطري", symbolEn: "QAR", symbolAr: "ر.ق", decimals: 2, perSAR: 0.9707 },
  { code: "OMR", nameEn: "Omani Rial", nameAr: "ريال عماني", symbolEn: "OMR", symbolAr: "ر.ع", decimals: 3, perSAR: 0.1026 },
  { code: "EGP", nameEn: "Egyptian Pound", nameAr: "جنيه مصري", symbolEn: "EGP", symbolAr: "ج.م", decimals: 2, perSAR: 13.12 },
  { code: "INR", nameEn: "Indian Rupee", nameAr: "روبية هندية", symbolEn: "₹", symbolAr: "₹", decimals: 2, perSAR: 22.4 },
  { code: "PKR", nameEn: "Pakistani Rupee", nameAr: "روبية باكستانية", symbolEn: "PKR", symbolAr: "ر.ب", decimals: 0, perSAR: 74.6 },
];

export function getCurrency(code: string): CurrencyInfo {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

/** Rounds to 2 decimals (halala precision) avoiding floating-point drift. */
export function roundSAR(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export function convertFromSAR(amountSAR: number, code: string): number {
  const c = getCurrency(code);
  const f = 10 ** c.decimals;
  return Math.round(amountSAR * c.perSAR * f) / f;
}

export function formatMoney(amountSAR: number, code: string, locale: "ar" | "en"): string {
  const c = getCurrency(code);
  const value = convertFromSAR(amountSAR, code);
  const num = new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    minimumFractionDigits: c.decimals,
    maximumFractionDigits: c.decimals,
  }).format(value);
  const sym = locale === "ar" ? c.symbolAr : c.symbolEn;
  return locale === "ar" ? `${num} ${sym}` : sym.length === 1 ? `${sym}${num}` : `${sym} ${num}`;
}
