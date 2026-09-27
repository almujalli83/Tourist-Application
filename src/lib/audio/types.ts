/** Audio guides: narrated tours of landmarks, heard in the visitor's language. */

/** Narration languages: Arabic and English first, then the main languages of Umrah visitors. */
export const AUDIO_LANGS = ["ar", "en", "ur", "id", "tr", "fr"] as const;
export type AudioLang = (typeof AUDIO_LANGS)[number];
export const isAudioLang = (v: unknown): v is AudioLang => typeof v === "string" && (AUDIO_LANGS as readonly string[]).includes(v);

/** Names of the languages in their own script (for the language menu). */
export const AUDIO_LANG_NAMES: Record<AudioLang, string> = {
  ar: "العربية", en: "English", ur: "اردو", id: "Bahasa Indonesia", tr: "Türkçe", fr: "Français",
};

/** Walking tour (stops a few minutes apart) or driving tour (stops across a city or region). */
export type TourMode = "walk" | "drive";

export interface AudioStop {
  id: string;
  /** The guide place this stop is about (for "listen" on the place), when there is one. */
  placeId?: string;
  nameAr: string;
  nameEn: string;
  lat: number;
  lng: number;
  /** The visitor is "at" the stop within this distance (metres). */
  radiusM: number;
  /** Narration text per language. */
  scripts: Partial<Record<AudioLang, string>>;
  /** Texts produced by machine translation and not yet reviewed by the team. */
  machine?: Partial<Record<AudioLang, true>>;
  /** Recordings uploaded by the team (preferred over synthetic voices): id in "audioClips". */
  recordings?: Partial<Record<AudioLang, string>>;
}

export interface AudioTour {
  id: string;
  city: string;
  mode: TourMode;
  titleAr: string;
  titleEn: string;
  summaryAr: string;
  summaryEn: string;
  /** Suggested duration including time at the stops. */
  minutes: number;
  stops: AudioStop[];
  status: "draft" | "published";
  updatedAt: string;
}

/** A stored audio file: a team recording or a cached synthetic narration. */
export interface AudioClip {
  id: string;
  tourId: string;
  stopId: string;
  lang: AudioLang;
  kind: "recording" | "tts";
  /** Hash of the script the synthetic narration was made from (re-made when the text changes). */
  scriptHash?: string;
  file: import("../files").StoredFileRef;
  createdAt: string;
}

/** One stop as sent to the visitor, in one language. */
export interface StopView {
  id: string;
  placeId?: string;
  nameAr: string;
  nameEn: string;
  lat: number;
  lng: number;
  radiusM: number;
  /** Narration text; null when this language is not available yet. */
  text: string | null;
  machine: boolean;
  /** Audio file (recording or synthetic voice); null → read by the device's voice. */
  audio: string | null;
  source: "recording" | "tts" | "device";
}

export interface TourSummary {
  id: string;
  city: string;
  mode: TourMode;
  titleAr: string;
  titleEn: string;
  summaryAr: string;
  summaryEn: string;
  minutes: number;
  km: number;
  stops: number;
  /** Languages with narration for every stop (others are translated on request when possible). */
  langs: AudioLang[];
  /** Guide place id → stop id, for "listen" on the place. */
  placeStops: Record<string, string>;
}

export interface TourView extends TourSummary {
  lang: AudioLang;
  stopsList: StopView[];
}
