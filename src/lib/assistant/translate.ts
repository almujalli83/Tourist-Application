/**
 * Live translation (text, voice and photos) with Claude. Voice is recognised and spoken in the
 * browser; the server translates text, and reads and translates the text in photos (menus, signs).
 * Sandbox mode (no API key) returns clearly marked placeholders.
 */
import { aiConfigured, askClaude } from "./claude";

export const LANGUAGES = ["ar", "en", "zh", "fr", "de", "es", "tr", "ur", "id"] as const;
export type Lang = (typeof LANGUAGES)[number];
export const LANGUAGE_NAMES: Record<Lang, string> = {
  ar: "Arabic", en: "English", zh: "Chinese (Simplified)", fr: "French", de: "German", es: "Spanish", tr: "Turkish", ur: "Urdu", id: "Indonesian",
};
export const MAX_TEXT_CHARS = 3000;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
type ImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export class TranslateError extends Error {}

const SYSTEM = `You are a professional translator for tourists in Saudi Arabia. Translate faithfully and naturally, keeping names, numbers, prices and units. Output only the translation, with no notes, quotes or explanations. If the text is already in the target language, return it unchanged.`;

export async function translateText(text: string, from: Lang | "auto", to: Lang): Promise<string> {
  const clean = text.trim().slice(0, MAX_TEXT_CHARS);
  if (!clean) throw new TranslateError("empty");
  if (!aiConfigured()) return `[${to}] ${clean}`;
  const src = from === "auto" ? "the detected language" : LANGUAGE_NAMES[from];
  const out = await askClaude({
    system: [{ type: "text", text: SYSTEM }],
    messages: [{ role: "user", content: `Translate from ${src} to ${LANGUAGE_NAMES[to]}:\n\n${clean}` }],
    maxTokens: 4000,
  });
  if (out === null) throw new TranslateError("declined");
  return out;
}

/** Reads and translates the text in a photo; data URL of a JPEG, PNG, WebP or GIF image. */
export async function translateImage(dataUrl: string, to: Lang): Promise<string> {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new TranslateError("invalidImage");
  const mediaType = m[1] as ImageType;
  if (Buffer.byteLength(m[2], "base64") > MAX_IMAGE_BYTES) throw new TranslateError("imageTooLarge");
  if (!aiConfigured()) return to === "ar" ? "[وضع تجريبي] ستظهر هنا ترجمة النص الموجود في الصورة بعد تفعيل Claude." : "[Sandbox] The translated text of the photo will appear here once Claude is enabled.";
  const out = await askClaude({
    system: [{ type: "text", text: SYSTEM }],
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: m[2] } },
        { type: "text", text: `Read all the text in this photo (for example a menu, sign or notice) and translate it into ${LANGUAGE_NAMES[to]}. Keep the layout: one line per item, with prices as shown. If there is no readable text, say so briefly in ${LANGUAGE_NAMES[to]}.` },
      ],
    }],
    maxTokens: 4000,
  });
  if (out === null) throw new TranslateError("declined");
  return out;
}
