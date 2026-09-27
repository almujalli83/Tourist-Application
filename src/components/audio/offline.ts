/** Offline listening: a service worker for the audio pages, and the tours saved on this device. */
import type { AudioLang, TourView } from "@/lib/audio/types";

const KEY = "ta_audio_dl";
const DATA = "ta-audio-data";
const CLIPS = "ta-audio-clips";
const PAGES = "ta-audio-pages";
const STATIC = "ta-audio-static";

export type Downloads = Record<string, { lang: AudioLang; at: string; urls: string[] }>;

export const offlineSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "caches" in window && window.isSecureContext;

export function registerAudioWorker(locale: string) {
  if (!offlineSupported()) return;
  navigator.serviceWorker.register("/audio-sw.js", { scope: `/${locale}/audio` }).catch(() => undefined);
}

export function readDownloads(): Downloads {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Downloads;
  } catch {
    return {};
  }
}

function writeDownloads(d: Downloads) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // storage unavailable: the files are still cached
  }
}

export const tourUrl = (id: string, lang: AudioLang) => `/api/audio/tours/${encodeURIComponent(id)}?lang=${lang}`;

/** Saves a tour (data, audio, the pages and the app files) for offline use. */
export async function downloadTour(tour: TourView, locale: string, onProgress?: (done: number, total: number) => void): Promise<void> {
  const dataUrl = tourUrl(tour.id, tour.lang);
  const clips = tour.stopsList.map((s) => s.audio).filter((u): u is string => !!u);
  const pages = [`/${locale}/audio`, `/${locale}/audio/${encodeURIComponent(tour.id)}`];
  const assets = [...new Set(performance.getEntriesByType("resource").map((e) => e.name).filter((n) => {
    try {
      const u = new URL(n);
      return u.origin === location.origin && u.pathname.startsWith("/_next/static/");
    } catch {
      return false;
    }
  }))];
  const jobs: [string, string][] = [
    [DATA, dataUrl],
    ...clips.map((u): [string, string] => [CLIPS, u]),
    ...pages.map((u): [string, string] => [PAGES, u]),
    ...assets.map((u): [string, string] => [STATIC, u]),
  ];
  let done = 0;
  onProgress?.(0, jobs.length);
  for (const [cacheName, url] of jobs) {
    const res = await fetch(url, { cache: "no-store" });
    // Data and audio are required; the page and app files make it work after a reload.
    if (!res.ok) {
      if (cacheName === DATA || cacheName === CLIPS) throw new Error(`download ${res.status}`);
    } else {
      await (await caches.open(cacheName)).put(url, res);
    }
    onProgress?.(++done, jobs.length);
  }
  writeDownloads({ ...readDownloads(), [tour.id]: { lang: tour.lang, at: new Date().toISOString(), urls: [dataUrl, ...clips] } });
}

export async function removeDownload(id: string): Promise<void> {
  const all = readDownloads();
  const d = all[id];
  if (d) {
    const data = await caches.open(DATA);
    const clips = await caches.open(CLIPS);
    for (const u of d.urls) {
      await data.delete(u);
      await clips.delete(u);
    }
  }
  delete all[id];
  writeDownloads(all);
}
