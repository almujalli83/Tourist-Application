/**
 * Audio tours: storage, the visitor's view in a language (missing languages are machine-translated
 * once and marked for review), audio files (team recordings first, then the text-to-speech
 * provider) and the back-office editing.
 */
import { createHash, randomUUID } from "node:crypto";
import { aiConfigured } from "../assistant/claude";
import { translateText } from "../assistant/translate";
import { deleteFile, readFile, saveFile } from "../files";
import { CITY_CENTERS } from "../guide/centers";
import { distanceKm } from "../guide/geo";
import { store } from "../store";
import { seedTours } from "./seed";
import { sniffAudio, synthesize, ttsConfigured } from "./tts";
import { AUDIO_LANGS, isAudioLang, type AudioClip, type AudioLang, type AudioStop, type AudioTour, type StopView, type TourMode, type TourSummary, type TourView } from "./types";

const SEED_FLAG = "audioSeed:v1";
export const MAX_SCRIPT = 3000;
export const MAX_RECORDING = 10 * 1024 * 1024;

export class AudioError extends Error {}

export async function ensureAudioSeeded(): Promise<void> {
  const s = store();
  if (await s.get("config", SEED_FLAG)) return;
  for (const t of seedTours()) await s.insert("audioTours", t.id, t);
  await s.insert("config", SEED_FLAG, { id: SEED_FLAG, at: new Date().toISOString() });
}

async function allTours(): Promise<AudioTour[]> {
  await ensureAudioSeeded();
  return store().list<AudioTour>("audioTours", 1000);
}

export async function getTour(id: string): Promise<AudioTour | null> {
  await ensureAudioSeeded();
  return store().get<AudioTour>("audioTours", id);
}

export function tourKm(t: Pick<AudioTour, "stops">): number {
  let km = 0;
  for (let i = 1; i < t.stops.length; i++) km += distanceKm(t.stops[i - 1], t.stops[i]);
  return Math.round(km * 10) / 10;
}

export function tourSummary(t: AudioTour): TourSummary {
  return {
    id: t.id, city: t.city, mode: t.mode, titleAr: t.titleAr, titleEn: t.titleEn, summaryAr: t.summaryAr, summaryEn: t.summaryEn,
    minutes: t.minutes, km: tourKm(t), stops: t.stops.length,
    langs: AUDIO_LANGS.filter((l) => t.stops.length > 0 && t.stops.every((s) => s.scripts[l])),
    placeStops: Object.fromEntries(t.stops.filter((s) => s.placeId).map((s) => [s.placeId!, s.id])),
  };
}

/** Published tours, optionally in one city; the tours about a guide place with `placeId`. */
export async function listTours(opts: { city?: string; placeId?: string } = {}): Promise<TourSummary[]> {
  const order = new Map(Object.keys(CITY_CENTERS).map((c, i) => [c, i]));
  return (await allTours())
    .filter((t) => t.status === "published" && t.stops.length > 0)
    .filter((t) => !opts.city || t.city === opts.city)
    .filter((t) => !opts.placeId || t.stops.some((s) => s.placeId === opts.placeId))
    .sort((a, b) => (order.get(a.city) ?? 99) - (order.get(b.city) ?? 99) || a.titleEn.localeCompare(b.titleEn))
    .map(tourSummary);
}

export const scriptHash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

/** Source language for machine translation: Arabic for Urdu, English for the Latin-script languages. */
const sourceOf = (lang: AudioLang): AudioLang => (lang === "ur" ? "ar" : "en");

const translating = new Map<string, Promise<void>>();

/** Translates the stops that have no text in `lang` (once; saved and marked for review). */
async function fillLanguage(tour: AudioTour, lang: AudioLang): Promise<AudioTour> {
  const missing = tour.stops.filter((s) => !s.scripts[lang]);
  if (!missing.length || !aiConfigured()) return tour;
  const key = `${tour.id}:${lang}`;
  let job = translating.get(key);
  if (!job) {
    job = (async () => {
      const texts: Record<string, string> = {};
      await Promise.all(missing.map(async (s) => {
        const from = s.scripts[sourceOf(lang)] ? sourceOf(lang) : s.scripts.ar ? "ar" : "en";
        const src = s.scripts[from];
        if (!src) return;
        try {
          const out = (await translateText(src, from, lang)).trim().slice(0, MAX_SCRIPT);
          if (out) texts[s.id] = out;
        } catch {
          // Left untranslated; tried again on the next request.
        }
      }));
      if (!Object.keys(texts).length) return;
      await store().update<AudioTour>("audioTours", tour.id, (t) => ({
        ...t,
        stops: t.stops.map((s) => (texts[s.id] && !s.scripts[lang]
          ? { ...s, scripts: { ...s.scripts, [lang]: texts[s.id] }, machine: { ...s.machine, [lang]: true as const } }
          : s)),
      }));
    })().finally(() => translating.delete(key));
    translating.set(key, job);
  }
  await job;
  return (await getTour(tour.id)) ?? tour;
}

const clipUrl = (tourId: string, stopId: string, lang: AudioLang, v: string) =>
  `/api/audio/clip/${encodeURIComponent(tourId)}/${encodeURIComponent(stopId)}/${lang}?v=${v}`;

function stopView(t: AudioTour, s: AudioStop, lang: AudioLang): StopView {
  const text = s.scripts[lang] ?? null;
  const rec = s.recordings?.[lang];
  const source: StopView["source"] = rec ? "recording" : text && ttsConfigured() ? "tts" : "device";
  return {
    id: s.id, ...(s.placeId ? { placeId: s.placeId } : {}), nameAr: s.nameAr, nameEn: s.nameEn, lat: s.lat, lng: s.lng, radiusM: s.radiusM,
    text, machine: !!s.machine?.[lang],
    audio: rec ? clipUrl(t.id, s.id, lang, rec.slice(0, 12)) : source === "tts" ? clipUrl(t.id, s.id, lang, scriptHash(text!)) : null,
    source,
  };
}

/** A published tour for the visitor, in one language. */
export async function tourView(id: string, lang: AudioLang, opts: { drafts?: boolean } = {}): Promise<TourView | null> {
  let t = await getTour(id);
  if (!t || (t.status !== "published" && !opts.drafts)) return null;
  t = await fillLanguage(t, lang);
  return { ...tourSummary(t), lang, stopsList: t.stops.map((s) => stopView(t!, s, lang)) };
}

/** The audio of a stop: the team's recording, else the provider's narration (made once per text). */
export async function stopAudio(tourId: string, stopId: string, lang: AudioLang, opts: { drafts?: boolean } = {}): Promise<{ data: Buffer; contentType: string } | null> {
  const t = await getTour(tourId);
  const s = t && (t.status === "published" || opts.drafts) ? t.stops.find((x) => x.id === stopId) : undefined;
  if (!t || !s) return null;
  const s_ = store();
  const recId = s.recordings?.[lang];
  if (recId) {
    const clip = await s_.get<AudioClip>("audioClips", recId);
    const data = clip ? await readFile(clip.file) : null;
    if (clip && data) return { data, contentType: clip.file.contentType };
  }
  const text = s.scripts[lang];
  if (!text || !ttsConfigured()) return null;
  const id = `tts:${t.id}:${s.id}:${lang}`;
  const hash = scriptHash(text);
  const cached = await s_.get<AudioClip>("audioClips", id);
  if (cached?.scriptHash === hash) {
    const data = await readFile(cached.file);
    if (data) return { data, contentType: cached.file.contentType };
  }
  const out = await synthesize(text, lang);
  const file = await saveFile("audio", out.data, out.contentType);
  await s_.put<AudioClip>("audioClips", id, { id, tourId: t.id, stopId: s.id, lang, kind: "tts", scriptHash: hash, file, createdAt: new Date().toISOString() });
  if (cached) await deleteFile(cached.file).catch(() => undefined);
  return out;
}

// ---------------------------------------------------------------- back office

export async function adminTours(): Promise<AudioTour[]> {
  return (await allTours()).sort((a, b) => a.city.localeCompare(b.city) || a.titleEn.localeCompare(b.titleEn));
}

const CITY_CODES = new Set(Object.keys(CITY_CENTERS));
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const inKsa = (lat: number, lng: number) => lat >= 15 && lat <= 33 && lng >= 34 && lng <= 56;

export interface TourInput {
  city?: string;
  mode?: TourMode;
  titleAr?: string;
  titleEn?: string;
  summaryAr?: string;
  summaryEn?: string;
  minutes?: number;
  status?: AudioTour["status"];
  stops?: {
    id?: string;
    nameAr?: string;
    nameEn?: string;
    lat?: number;
    lng?: number;
    radiusM?: number;
    scripts?: Partial<Record<string, string>>;
    /** Languages whose machine translation the team has reviewed. */
    approve?: string[];
  }[];
}

function validateTour(input: TourInput, prev: AudioTour | null): AudioTour {
  const city = input.city ?? prev?.city ?? "";
  if (!CITY_CODES.has(city)) throw new AudioError("invalidCity");
  const mode = input.mode ?? prev?.mode ?? "walk";
  if (mode !== "walk" && mode !== "drive") throw new AudioError("invalidMode");
  const titleAr = input.titleAr !== undefined ? str(input.titleAr, 120) : prev?.titleAr ?? "";
  const titleEn = input.titleEn !== undefined ? str(input.titleEn, 120) : prev?.titleEn ?? "";
  if (!titleAr || !titleEn) throw new AudioError("titleRequired");
  const minutes = input.minutes ?? prev?.minutes ?? 60;
  if (!Number.isInteger(minutes) || minutes < 10 || minutes > 1440) throw new AudioError("invalidMinutes");
  const status = input.status ?? prev?.status ?? "draft";
  if (status !== "draft" && status !== "published") throw new AudioError("invalidStatus");

  let stops = prev?.stops ?? [];
  if (input.stops) {
    if (input.stops.length > 30) throw new AudioError("tooManyStops");
    const seen = new Set<string>();
    stops = input.stops.map((si) => {
      const old = si.id ? prev?.stops.find((x) => x.id === si.id) : undefined;
      const id = old?.id ?? randomUUID().slice(0, 8);
      if (seen.has(id)) throw new AudioError("duplicateStop");
      seen.add(id);
      const nameAr = si.nameAr !== undefined ? str(si.nameAr, 120) : old?.nameAr ?? "";
      const nameEn = si.nameEn !== undefined ? str(si.nameEn, 120) : old?.nameEn ?? "";
      if (!nameAr || !nameEn) throw new AudioError("stopNameRequired");
      const lat = si.lat ?? old?.lat;
      const lng = si.lng ?? old?.lng;
      if (typeof lat !== "number" || typeof lng !== "number" || !inKsa(lat, lng)) throw new AudioError("invalidLocation");
      const radiusM = si.radiusM ?? old?.radiusM ?? (mode === "walk" ? 60 : 400);
      if (!Number.isInteger(radiusM) || radiusM < 20 || radiusM > 3000) throw new AudioError("invalidRadius");
      const scripts: AudioStop["scripts"] = { ...old?.scripts };
      const machine: NonNullable<AudioStop["machine"]> = { ...old?.machine };
      for (const [lang, v] of Object.entries(si.scripts ?? {})) {
        if (!isAudioLang(lang) || typeof v !== "string") throw new AudioError("invalidLanguage");
        const text = v.trim();
        if (text.length > MAX_SCRIPT) throw new AudioError("scriptTooLong");
        if (text === (scripts[lang] ?? "")) continue;
        if (text) scripts[lang] = text; else delete scripts[lang];
        delete machine[lang]; // edited by the team
      }
      for (const lang of si.approve ?? []) if (isAudioLang(lang)) delete machine[lang];
      if (!scripts.ar || !scripts.en) throw new AudioError("scriptRequired");
      return {
        id, ...(old?.placeId ? { placeId: old.placeId } : {}), nameAr, nameEn, lat, lng, radiusM, scripts,
        ...(Object.keys(machine).length ? { machine } : {}),
        ...(old?.recordings && Object.keys(old.recordings).length ? { recordings: old.recordings } : {}),
      };
    });
  }
  if (status === "published" && !stops.length) throw new AudioError("noStops");
  return {
    id: prev?.id ?? `tour-${randomUUID().slice(0, 8)}`, city, mode, titleAr, titleEn,
    summaryAr: input.summaryAr !== undefined ? str(input.summaryAr, 300) : prev?.summaryAr ?? "",
    summaryEn: input.summaryEn !== undefined ? str(input.summaryEn, 300) : prev?.summaryEn ?? "",
    minutes, stops, status, updatedAt: new Date().toISOString(),
  };
}

export async function createTour(input: TourInput): Promise<AudioTour> {
  const t = validateTour({ ...input, status: "draft" }, null);
  await store().insert("audioTours", t.id, t);
  return t;
}

export async function updateTour(id: string, input: TourInput): Promise<AudioTour> {
  const prev = await getTour(id);
  if (!prev) throw new AudioError("notFound");
  const t = validateTour(input, prev);
  // Recordings of removed stops are deleted.
  for (const s of prev.stops) if (!t.stops.some((x) => x.id === s.id)) await dropClips(s.recordings);
  await store().put("audioTours", id, t);
  return t;
}

export async function deleteTour(id: string): Promise<void> {
  const t = await getTour(id);
  if (!t) throw new AudioError("notFound");
  if (t.status === "published") throw new AudioError("unpublishFirst");
  for (const s of t.stops) await dropClips(s.recordings);
  await store().delete("audioTours", id);
}

async function dropClips(recs: AudioStop["recordings"]) {
  for (const clipId of Object.values(recs ?? {})) {
    const clip = clipId ? await store().get<AudioClip>("audioClips", clipId) : null;
    if (clip) {
      await deleteFile(clip.file).catch(() => undefined);
      await store().delete("audioClips", clip.id);
    }
  }
}

/** Machine-translates every missing language of a tour (for the team to review). */
export async function translateTour(id: string): Promise<{ translated: number }> {
  const t = await getTour(id);
  if (!t) throw new AudioError("notFound");
  if (!aiConfigured()) throw new AudioError("aiUnavailable");
  const before = t.stops.reduce((n, s) => n + Object.keys(s.scripts).length, 0);
  let cur = t;
  for (const lang of AUDIO_LANGS) cur = await fillLanguage(cur, lang);
  return { translated: cur.stops.reduce((n, s) => n + Object.keys(s.scripts).length, 0) - before };
}

/** Saves the team's recording of a stop in a language (replaces the previous one). */
export async function addRecording(tourId: string, stopId: string, lang: AudioLang, data: Buffer): Promise<AudioTour> {
  const t = await getTour(tourId);
  const s = t?.stops.find((x) => x.id === stopId);
  if (!t || !s) throw new AudioError("notFound");
  if (data.length > MAX_RECORDING) throw new AudioError("fileTooLarge");
  const contentType = sniffAudio(data);
  if (!contentType) throw new AudioError("invalidAudio");
  const file = await saveFile("audio", data, contentType);
  const id = `rec-${randomUUID()}`;
  await store().insert<AudioClip>("audioClips", id, { id, tourId, stopId, lang, kind: "recording", file, createdAt: new Date().toISOString() });
  const old = s.recordings?.[lang];
  const updated = (await store().update<AudioTour>("audioTours", tourId, (x) => ({
    ...x,
    updatedAt: new Date().toISOString(),
    stops: x.stops.map((y) => (y.id === stopId ? { ...y, recordings: { ...y.recordings, [lang]: id } } : y)),
  })))!;
  if (old) await dropClips({ [lang]: old });
  return updated;
}

export async function removeRecording(tourId: string, stopId: string, lang: AudioLang): Promise<AudioTour> {
  const t = await getTour(tourId);
  const s = t?.stops.find((x) => x.id === stopId);
  if (!t || !s?.recordings?.[lang]) throw new AudioError("notFound");
  await dropClips({ [lang]: s.recordings[lang] });
  return (await store().update<AudioTour>("audioTours", tourId, (x) => ({
    ...x,
    updatedAt: new Date().toISOString(),
    stops: x.stops.map((y) => {
      if (y.id !== stopId) return y;
      const recordings = { ...y.recordings };
      delete recordings[lang];
      return { ...y, recordings };
    }),
  })))!;
}
