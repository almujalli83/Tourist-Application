import { fmt, type Dictionary } from "@/i18n";

export function durationText(a: Dictionary["audio"], minutes: number): string {
  if (minutes < 60) return fmt(a.min, { n: minutes });
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? fmt(a.hrMin, { h, m }) : fmt(a.hr, { h });
}

export function distanceText(a: Dictionary["audio"], km: number): string {
  return km < 1 ? fmt(a.meters, { n: Math.round((km * 1000) / 10) * 10 }) : fmt(a.kms, { n: Math.round(km * 10) / 10 });
}

const LANG_KEY = "ta_audio_lang";
export function savedLang(): string | null {
  try {
    return localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
}
export function saveLang(l: string) {
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    // ignore
  }
}

/** Splits a narration into sentences (browsers stop long utterances), at most ~220 characters each. */
export function speechChunks(text: string): string[] {
  const parts = text.split(/(?<=[.!?؟۔])\s+|\n+/);
  const out: string[] = [];
  for (const p of parts.map((x) => x.trim()).filter(Boolean)) {
    if (p.length <= 220) out.push(p);
    else for (const piece of p.split(/(?<=[,،;])\s+/)) out.push(piece);
  }
  return out;
}
