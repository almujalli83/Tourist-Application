/** Content locales: pages and content exist in Arabic and English (the URL prefix). */
export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ar";

export function isLocale(v: string | undefined): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}

export const dir = (l: Locale) => (l === "ar" ? "rtl" : "ltr");

/**
 * Interface languages: Arabic and English, plus languages that translate the interface over the
 * English pages (content such as place and hotel names stays in English). Chosen with the ta_ui cookie.
 */
export const UI_LANGS = ["ar", "en", "fr", "tr", "ur", "id", "zh"] as const;
export type UiLang = (typeof UI_LANGS)[number];
export const UI_COOKIE = "ta_ui";

export const UI_LANG_NAMES: Record<UiLang, string> = {
  ar: "العربية", en: "English", fr: "Français", tr: "Türkçe", ur: "اردو", id: "Bahasa Indonesia", zh: "中文",
};

export const isUiLang = (v: string | undefined | null): v is UiLang => !!v && (UI_LANGS as readonly string[]).includes(v);
export const uiDir = (l: UiLang) => (l === "ar" || l === "ur" ? "rtl" : "ltr");
/** The pages a language reads: Arabic for Arabic, English for the others. */
export const contentLocale = (l: UiLang): Locale => (l === "ar" ? "ar" : "en");

/** The interface language for a page: the chosen one when it reads this page's locale, else the page's. */
export function uiLangFor(locale: Locale, chosen: string | undefined | null): UiLang {
  return isUiLang(chosen) && contentLocale(chosen) === locale ? chosen : locale;
}
