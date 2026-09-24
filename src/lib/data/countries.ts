/**
 * Country reference data used for nationality, birthplace and passport issue place.
 * `iso2` is the key used everywhere in the app and matches the `code` returned by the
 * MT lookup APIs (getNationality / getBirthPlace / getPassportIssuePlace).
 * `iso3` is used to map the passport MRZ (ICAO 9303) to a country.
 */
export interface Country {
  iso2: string;
  iso3: string;
  en: string;
  ar: string;
  /** Arabic-speaking country → Arabic names are mandatory in the eVisa request. */
  arab?: boolean;
}

export const COUNTRIES: Country[] = [
  { iso2: "SA", iso3: "SAU", en: "Saudi Arabia", ar: "المملكة العربية السعودية", arab: true },
  { iso2: "AE", iso3: "ARE", en: "United Arab Emirates", ar: "الإمارات العربية المتحدة", arab: true },
  { iso2: "BH", iso3: "BHR", en: "Bahrain", ar: "البحرين", arab: true },
  { iso2: "KW", iso3: "KWT", en: "Kuwait", ar: "الكويت", arab: true },
  { iso2: "OM", iso3: "OMN", en: "Oman", ar: "عُمان", arab: true },
  { iso2: "QA", iso3: "QAT", en: "Qatar", ar: "قطر", arab: true },
  { iso2: "EG", iso3: "EGY", en: "Egypt", ar: "مصر", arab: true },
  { iso2: "JO", iso3: "JOR", en: "Jordan", ar: "الأردن", arab: true },
  { iso2: "LB", iso3: "LBN", en: "Lebanon", ar: "لبنان", arab: true },
  { iso2: "SY", iso3: "SYR", en: "Syria", ar: "سوريا", arab: true },
  { iso2: "IQ", iso3: "IRQ", en: "Iraq", ar: "العراق", arab: true },
  { iso2: "PS", iso3: "PSE", en: "Palestine", ar: "فلسطين", arab: true },
  { iso2: "YE", iso3: "YEM", en: "Yemen", ar: "اليمن", arab: true },
  { iso2: "SD", iso3: "SDN", en: "Sudan", ar: "السودان", arab: true },
  { iso2: "LY", iso3: "LBY", en: "Libya", ar: "ليبيا", arab: true },
  { iso2: "TN", iso3: "TUN", en: "Tunisia", ar: "تونس", arab: true },
  { iso2: "DZ", iso3: "DZA", en: "Algeria", ar: "الجزائر", arab: true },
  { iso2: "MA", iso3: "MAR", en: "Morocco", ar: "المغرب", arab: true },
  { iso2: "MR", iso3: "MRT", en: "Mauritania", ar: "موريتانيا", arab: true },
  { iso2: "SO", iso3: "SOM", en: "Somalia", ar: "الصومال", arab: true },
  { iso2: "DJ", iso3: "DJI", en: "Djibouti", ar: "جيبوتي", arab: true },
  { iso2: "KM", iso3: "COM", en: "Comoros", ar: "جزر القمر", arab: true },
  { iso2: "IN", iso3: "IND", en: "India", ar: "الهند" },
  { iso2: "PK", iso3: "PAK", en: "Pakistan", ar: "باكستان" },
  { iso2: "BD", iso3: "BGD", en: "Bangladesh", ar: "بنغلاديش" },
  { iso2: "LK", iso3: "LKA", en: "Sri Lanka", ar: "سريلانكا" },
  { iso2: "NP", iso3: "NPL", en: "Nepal", ar: "نيبال" },
  { iso2: "ID", iso3: "IDN", en: "Indonesia", ar: "إندونيسيا" },
  { iso2: "MY", iso3: "MYS", en: "Malaysia", ar: "ماليزيا" },
  { iso2: "SG", iso3: "SGP", en: "Singapore", ar: "سنغافورة" },
  { iso2: "BN", iso3: "BRN", en: "Brunei", ar: "بروناي" },
  { iso2: "TH", iso3: "THA", en: "Thailand", ar: "تايلاند" },
  { iso2: "PH", iso3: "PHL", en: "Philippines", ar: "الفلبين" },
  { iso2: "VN", iso3: "VNM", en: "Vietnam", ar: "فيتنام" },
  { iso2: "CN", iso3: "CHN", en: "China", ar: "الصين" },
  { iso2: "HK", iso3: "HKG", en: "Hong Kong", ar: "هونغ كونغ" },
  { iso2: "JP", iso3: "JPN", en: "Japan", ar: "اليابان" },
  { iso2: "KR", iso3: "KOR", en: "South Korea", ar: "كوريا الجنوبية" },
  { iso2: "KZ", iso3: "KAZ", en: "Kazakhstan", ar: "كازاخستان" },
  { iso2: "UZ", iso3: "UZB", en: "Uzbekistan", ar: "أوزبكستان" },
  { iso2: "AZ", iso3: "AZE", en: "Azerbaijan", ar: "أذربيجان" },
  { iso2: "TR", iso3: "TUR", en: "Türkiye", ar: "تركيا" },
  { iso2: "IR", iso3: "IRN", en: "Iran", ar: "إيران" },
  { iso2: "AF", iso3: "AFG", en: "Afghanistan", ar: "أفغانستان" },
  { iso2: "MV", iso3: "MDV", en: "Maldives", ar: "المالديف" },
  { iso2: "RU", iso3: "RUS", en: "Russia", ar: "روسيا" },
  { iso2: "UA", iso3: "UKR", en: "Ukraine", ar: "أوكرانيا" },
  { iso2: "GB", iso3: "GBR", en: "United Kingdom", ar: "المملكة المتحدة" },
  { iso2: "IE", iso3: "IRL", en: "Ireland", ar: "أيرلندا" },
  { iso2: "FR", iso3: "FRA", en: "France", ar: "فرنسا" },
  { iso2: "DE", iso3: "DEU", en: "Germany", ar: "ألمانيا" },
  { iso2: "IT", iso3: "ITA", en: "Italy", ar: "إيطاليا" },
  { iso2: "ES", iso3: "ESP", en: "Spain", ar: "إسبانيا" },
  { iso2: "PT", iso3: "PRT", en: "Portugal", ar: "البرتغال" },
  { iso2: "NL", iso3: "NLD", en: "Netherlands", ar: "هولندا" },
  { iso2: "BE", iso3: "BEL", en: "Belgium", ar: "بلجيكا" },
  { iso2: "LU", iso3: "LUX", en: "Luxembourg", ar: "لوكسمبورغ" },
  { iso2: "CH", iso3: "CHE", en: "Switzerland", ar: "سويسرا" },
  { iso2: "AT", iso3: "AUT", en: "Austria", ar: "النمسا" },
  { iso2: "SE", iso3: "SWE", en: "Sweden", ar: "السويد" },
  { iso2: "NO", iso3: "NOR", en: "Norway", ar: "النرويج" },
  { iso2: "DK", iso3: "DNK", en: "Denmark", ar: "الدنمارك" },
  { iso2: "FI", iso3: "FIN", en: "Finland", ar: "فنلندا" },
  { iso2: "PL", iso3: "POL", en: "Poland", ar: "بولندا" },
  { iso2: "CZ", iso3: "CZE", en: "Czechia", ar: "التشيك" },
  { iso2: "GR", iso3: "GRC", en: "Greece", ar: "اليونان" },
  { iso2: "RO", iso3: "ROU", en: "Romania", ar: "رومانيا" },
  { iso2: "HU", iso3: "HUN", en: "Hungary", ar: "المجر" },
  { iso2: "BG", iso3: "BGR", en: "Bulgaria", ar: "بلغاريا" },
  { iso2: "HR", iso3: "HRV", en: "Croatia", ar: "كرواتيا" },
  { iso2: "US", iso3: "USA", en: "United States", ar: "الولايات المتحدة" },
  { iso2: "CA", iso3: "CAN", en: "Canada", ar: "كندا" },
  { iso2: "MX", iso3: "MEX", en: "Mexico", ar: "المكسيك" },
  { iso2: "BR", iso3: "BRA", en: "Brazil", ar: "البرازيل" },
  { iso2: "AR", iso3: "ARG", en: "Argentina", ar: "الأرجنتين" },
  { iso2: "AU", iso3: "AUS", en: "Australia", ar: "أستراليا" },
  { iso2: "NZ", iso3: "NZL", en: "New Zealand", ar: "نيوزيلندا" },
  { iso2: "ZA", iso3: "ZAF", en: "South Africa", ar: "جنوب أفريقيا" },
  { iso2: "NG", iso3: "NGA", en: "Nigeria", ar: "نيجيريا" },
  { iso2: "KE", iso3: "KEN", en: "Kenya", ar: "كينيا" },
  { iso2: "ET", iso3: "ETH", en: "Ethiopia", ar: "إثيوبيا" },
  { iso2: "SN", iso3: "SEN", en: "Senegal", ar: "السنغال" },
];

const byIso2 = new Map(COUNTRIES.map((c) => [c.iso2, c]));
const byIso3 = new Map(COUNTRIES.map((c) => [c.iso3, c]));

export function getCountry(iso2: string | undefined | null): Country | undefined {
  return iso2 ? byIso2.get(iso2.toUpperCase()) : undefined;
}

/** Maps an MRZ country code (ISO 3166-1 alpha-3, "D" for Germany) to ISO2. */
export function countryFromIso3(code: string): Country | undefined {
  const clean = code.replace(/</g, "").toUpperCase();
  return byIso3.get(clean === "D" ? "DEU" : clean);
}

export function isArabCountry(iso2: string | undefined | null): boolean {
  return Boolean(getCountry(iso2)?.arab);
}

export function countryName(iso2: string, locale: "ar" | "en"): string {
  const c = getCountry(iso2);
  return c ? c[locale] : iso2;
}
