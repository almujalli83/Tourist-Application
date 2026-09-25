import { AiUnavailableError } from "@/lib/assistant/claude";
import { LANGUAGES, translateImage, translateText, TranslateError, type Lang } from "@/lib/assistant/translate";
import { takeQuota, visitorKey } from "@/lib/assistant/usage";
import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";

export const maxDuration = 60;

const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGUAGES as readonly string[]).includes(v);

/** { mode: "text", text, from ("auto" or a language), to } | { mode: "image", image (data URL), to } */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  const b = await body<{ mode?: string; text?: string; from?: string; to?: string; image?: string }>(req);
  if (!b || !isLang(b.to) || (b.mode !== "text" && b.mode !== "image")) return error("invalidRequest", 400);
  if (b.mode === "text" && (typeof b.text !== "string" || !b.text.trim() || (b.from !== "auto" && !isLang(b.from)))) return error("invalidRequest", 400);
  if (b.mode === "image" && typeof b.image !== "string") return error("invalidRequest", 400);
  const quota = await takeQuota(user ? `user:${user.id}` : visitorKey(req), !!user);
  if (!quota.ok) return error("dailyLimit", 429);
  try {
    const translation = b.mode === "text"
      ? await translateText(b.text!, b.from as Lang | "auto", b.to)
      : await translateImage(b.image!, b.to);
    return json({ translation, remaining: quota.remaining });
  } catch (e) {
    if (e instanceof TranslateError) return error(e.message, 422);
    if (e instanceof AiUnavailableError) return error("unavailable", 503);
    throw e;
  }
});
