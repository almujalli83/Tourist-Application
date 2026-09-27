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

/** Built-in rates (the live ones replace them); USD and the Gulf currencies pegged to it are exact. */
export const CURRENCIES: CurrencyInfo[] = [
  { code: "SAR", nameEn: "Saudi Riyal", nameAr: "ريال سعودي", symbolEn: "SAR", symbolAr: "ر.س", decimals: 2, perSAR: 1 },
  { code: "USD", nameEn: "US Dollar", nameAr: "دولار أمريكي", symbolEn: "$", symbolAr: "$", decimals: 2, perSAR: 1 / 3.75 },
  { code: "EUR", nameEn: "Euro", nameAr: "يورو", symbolEn: "€", symbolAr: "€", decimals: 2, perSAR: 0.2451 },
  { code: "GBP", nameEn: "British Pound", nameAr: "جنيه إسترليني", symbolEn: "£", symbolAr: "£", decimals: 2, perSAR: 0.2083 },
  { code: "AED", nameEn: "UAE Dirham", nameAr: "درهم إماراتي", symbolEn: "AED", symbolAr: "د.إ", decimals: 2, perSAR: 3.6725 / 3.75 },
  { code: "KWD", nameEn: "Kuwaiti Dinar", nameAr: "دينار كويتي", symbolEn: "KWD", symbolAr: "د.ك", decimals: 3, perSAR: 0.0818 },
  { code: "BHD", nameEn: "Bahraini Dinar", nameAr: "دينار بحريني", symbolEn: "BHD", symbolAr: "د.ب", decimals: 3, perSAR: 0.376 / 3.75 },
  { code: "QAR", nameEn: "Qatari Riyal", nameAr: "ريال قطري", symbolEn: "QAR", symbolAr: "ر.ق", decimals: 2, perSAR: 3.64 / 3.75 },
  { code: "OMR", nameEn: "Omani Rial", nameAr: "ريال عماني", symbolEn: "OMR", symbolAr: "ر.ع", decimals: 3, perSAR: 0.3845 / 3.75 },
  { code: "EGP", nameEn: "Egyptian Pound", nameAr: "جنيه مصري", symbolEn: "EGP", symbolAr: "ج.م", decimals: 2, perSAR: 13.12 },
  { code: "INR", nameEn: "Indian Rupee", nameAr: "روبية هندية", symbolEn: "₹", symbolAr: "₹", decimals: 2, perSAR: 22.4 },
  { code: "PKR", nameEn: "Pakistani Rupee", nameAr: "روبية باكستانية", symbolEn: "PKR", symbolAr: "ر.ب", decimals: 0, perSAR: 74.6 },
  { code: "CNY", nameEn: "Chinese Yuan", nameAr: "يوان صيني", symbolEn: "CN¥", symbolAr: "CN¥", decimals: 2, perSAR: 1.9 },
  { code: "JPY", nameEn: "Japanese Yen", nameAr: "ين ياباني", symbolEn: "JP¥", symbolAr: "JP¥", decimals: 0, perSAR: 40 },
  { code: "KRW", nameEn: "South Korean Won", nameAr: "وون كوري", symbolEn: "₩", symbolAr: "₩", decimals: 0, perSAR: 368 },
  { code: "IDR", nameEn: "Indonesian Rupiah", nameAr: "روبية إندونيسية", symbolEn: "IDR", symbolAr: "IDR", decimals: 0, perSAR: 4300 },
  { code: "MYR", nameEn: "Malaysian Ringgit", nameAr: "رينغيت ماليزي", symbolEn: "RM", symbolAr: "RM", decimals: 2, perSAR: 1.17 },
  { code: "TRY", nameEn: "Turkish Lira", nameAr: "ليرة تركية", symbolEn: "TRY", symbolAr: "TRY", decimals: 2, perSAR: 10 },
  { code: "BDT", nameEn: "Bangladeshi Taka", nameAr: "تاكا بنغلاديشي", symbolEn: "BDT", symbolAr: "BDT", decimals: 0, perSAR: 32 },
  { code: "PHP", nameEn: "Philippine Peso", nameAr: "بيزو فلبيني", symbolEn: "₱", symbolAr: "₱", decimals: 2, perSAR: 15 },
  { code: "NGN", nameEn: "Nigerian Naira", nameAr: "نيرة نيجيرية", symbolEn: "NGN", symbolAr: "NGN", decimals: 0, perSAR: 400 },
  { code: "RUB", nameEn: "Russian Ruble", nameAr: "روبل روسي", symbolEn: "RUB", symbolAr: "RUB", decimals: 0, perSAR: 22 },
  { code: "CHF", nameEn: "Swiss Franc", nameAr: "فرنك سويسري", symbolEn: "CHF", symbolAr: "CHF", decimals: 2, perSAR: 0.23 },
  { code: "CAD", nameEn: "Canadian Dollar", nameAr: "دولار كندي", symbolEn: "C$", symbolAr: "C$", decimals: 2, perSAR: 0.37 },
  { code: "AUD", nameEn: "Australian Dollar", nameAr: "دولار أسترالي", symbolEn: "A$", symbolAr: "A$", decimals: 2, perSAR: 0.41 },
  { code: "JOD", nameEn: "Jordanian Dinar", nameAr: "دينار أردني", symbolEn: "JOD", symbolAr: "د.أ", decimals: 3, perSAR: 0.189 },
  { code: "MAD", nameEn: "Moroccan Dirham", nameAr: "درهم مغربي", symbolEn: "MAD", symbolAr: "د.م", decimals: 2, perSAR: 2.5 },
];

/** Live rates (units per 1 SAR) from the rates provider, set when loaded; the built-in ones otherwise. */
let live: Record<string, number> | null = null;
export function setLiveRates(rates: Record<string, number> | null) {
  live = rates;
}
const rateOf = (c: CurrencyInfo) => live?.[c.code] ?? c.perSAR;

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
  return Math.round(amountSAR * rateOf(c) * f) / f;
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

/** Converts an amount in a currency to SAR (for the converter). */
export function convertToSAR(amount: number, code: string): number {
  return roundSAR(amount / rateOf(getCurrency(code)));
}

/** Formats an amount already in `code` (not converted). */
export function formatIn(amount: number, code: string, locale: "ar" | "en"): string {
  const c = getCurrency(code);
  const num = new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", { minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals }).format(amount);
  const sym = locale === "ar" ? c.symbolAr : c.symbolEn;
  return locale === "ar" ? `${num} ${sym}` : sym.length === 1 ? `${sym}${num}` : `${sym} ${num}`;
}
