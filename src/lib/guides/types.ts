/** Licensed tour guides (Ministry of Tourism): shared types (client-safe). */
export const GUIDE_TRACKS = ["heritage", "culture", "nature", "adventure", "religious", "city", "desert", "diving", "food"] as const;
export type GuideTrack = (typeof GUIDE_TRACKS)[number];
export const LANGUAGE_LEVELS = ["native", "fluent", "good"] as const;
export type LanguageLevel = (typeof LANGUAGE_LEVELS)[number];

export interface GuideLanguage {
  /** ISO 639-1 code (ar, en, fr, zh, …). */
  code: string;
  level: LanguageLevel;
}

export interface PublicGuide {
  licenseNo: string;
  licenseExpiry: string;
  nameAr: string;
  nameEn: string;
  gender: "male" | "female";
  phone: string;
  email: string | null;
  languages: GuideLanguage[];
  /** Saudi city codes covered. */
  cities: string[];
  tracks: GuideTrack[];
  bioAr: string;
  bioEn: string;
  hasPhoto: boolean;
  demo?: boolean;
}

export interface GuideFilters {
  city?: string;
  language?: string;
  track?: string;
  gender?: string;
  q?: string;
}

/** Common guide languages (ISO 639-1) with names. */
export const GUIDE_LANGUAGES: Record<string, [string, string]> = {
  ar: ["العربية", "Arabic"], en: ["الإنجليزية", "English"], fr: ["الفرنسية", "French"], de: ["الألمانية", "German"], es: ["الإسبانية", "Spanish"],
  it: ["الإيطالية", "Italian"], zh: ["الصينية", "Chinese"], ja: ["اليابانية", "Japanese"], ko: ["الكورية", "Korean"], ru: ["الروسية", "Russian"],
  tr: ["التركية", "Turkish"], ur: ["الأوردية", "Urdu"], hi: ["الهندية", "Hindi"], id: ["الإندونيسية", "Indonesian"], ms: ["الماليزية", "Malay"],
  fa: ["الفارسية", "Persian"], bn: ["البنغالية", "Bengali"], pt: ["البرتغالية", "Portuguese"],
};
