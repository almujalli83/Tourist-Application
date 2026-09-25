import { cleanHistory, clearHistory, getHistory, MAX_MESSAGE_CHARS, reply } from "@/lib/assistant/assistant";
import { aiConfigured, AiUnavailableError } from "@/lib/assistant/claude";
import { quotaLeft, takeQuota, visitorKey } from "@/lib/assistant/usage";
import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";

export const maxDuration = 60;

/** Mode, today's remaining messages and (signed-in) the saved conversation. */
export const GET = handle(async (req: Request) => {
  const user = await currentUser();
  return json({
    mode: aiConfigured() ? "live" : "sandbox",
    remaining: await quotaLeft(user ? `user:${user.id}` : visitorKey(req), !!user),
    history: user ? await getHistory(user.id) : null,
  });
});

/** { message, locale, history? (visitors only) } */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  const b = await body<{ message?: string; locale?: string; history?: unknown }>(req);
  const message = typeof b?.message === "string" ? b.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE_CHARS) return error("invalidMessage", 400);
  const quota = await takeQuota(user ? `user:${user.id}` : visitorKey(req), !!user);
  if (!quota.ok) return error("dailyLimit", 429);
  try {
    const out = await reply({ user, locale: b?.locale === "en" ? "en" : "ar", message, guestHistory: user ? undefined : cleanHistory(b?.history) });
    return json({ ...out, remaining: quota.remaining });
  } catch (e) {
    if (e instanceof AiUnavailableError) return error("unavailable", 503);
    throw e;
  }
});

/** Deletes the signed-in account's conversation. */
export const DELETE = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  await clearHistory(user.id);
  return json({ ok: true });
});
