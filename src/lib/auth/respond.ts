import { error, json } from "../http";
import { AccountError } from "./account";
import { currentSession } from "./session";

const STATUS: Record<string, number> = { unauthorized: 401, invalid: 401, tooManyAttempts: 429, exists: 409 };

/** Runs an account action and maps its errors to responses. */
export async function accountAction(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AccountError) return json({ error: e.message, ...(e.minutes ? { minutes: e.minutes } : {}) }, STATUS[e.message] ?? 422);
    throw e;
  }
}

/** For signed-in actions: the session, or a 401 response. */
export async function signedIn(): Promise<{ userId: string; sessionId: string } | Response> {
  const s = await currentSession();
  return s ? { userId: s.user.id, sessionId: s.sessionId } : error("unauthorized", 401);
}

export const localeOf = (v: unknown): "ar" | "en" => (v === "en" ? "en" : "ar");
