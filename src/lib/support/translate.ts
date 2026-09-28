/**
 * Translation of support messages between the traveller's language and Arabic (the team's).
 * Claude when configured; otherwise the free MyMemory service (api.mymemory.translated.net;
 * SUPPORT_TRANSLATE_EMAIL raises its daily quota; SUPPORT_TRANSLATE=off disables it).
 * Returns null when the text can't be translated: the original is always shown.
 */
import { aiConfigured } from "../assistant/claude";
import { crossBorderAllowed } from "../compliance/residency";
import { translateText, type Lang } from "../assistant/translate";

const MYMEMORY_MAX = 480;
/** MyMemory language codes (RFC 3066) where they differ from ours. */
const MM_CODE: Partial<Record<Lang, string>> = { zh: "zh-CN" };
const mm = (l: Lang) => MM_CODE[l] ?? l;

function chunks(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (const part of text.split(/(?<=[.!?؟\n])\s+/)) {
    if ((cur + " " + part).trim().length > MYMEMORY_MAX && cur) {
      out.push(cur.trim());
      cur = part;
    } else cur = `${cur} ${part}`;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.flatMap((c) => (c.length > MYMEMORY_MAX ? c.match(new RegExp(`[\\s\\S]{1,${MYMEMORY_MAX}}`, "g")) ?? [] : [c]));
}

async function myMemory(text: string, from: Lang, to: Lang): Promise<string | null> {
  const email = process.env.SUPPORT_TRANSLATE_EMAIL?.trim();
  const parts: string[] = [];
  for (const q of chunks(text)) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${mm(from)}|${mm(to)}${email ? `&de=${encodeURIComponent(email)}` : ""}`;
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) return null;
      const d = (await res.json()) as { responseStatus?: number | string; responseData?: { translatedText?: string } };
      const t = d.responseData?.translatedText;
      if (Number(d.responseStatus) !== 200 || !t || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(t)) return null;
      parts.push(t);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return parts.join(" ");
}

export async function translateSupport(text: string, from: Lang, to: Lang): Promise<string | null> {
  if (!text.trim() || from === to) return null;
  if (aiConfigured()) {
    try {
      return await translateText(text, from, to);
    } catch {
      return null;
    }
  }
  if (process.env.SUPPORT_TRANSLATE === "off" || !crossBorderAllowed("translate")) return null;
  return myMemory(text, from, to);
}
