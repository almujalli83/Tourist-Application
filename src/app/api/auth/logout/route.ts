import { clearSessionCookie, currentSession } from "@/lib/auth/session";
import { revokeSession } from "@/lib/auth/sessions";
import { handle, json } from "@/lib/http";

export const POST = handle(async () => {
  const s = await currentSession();
  if (s) await revokeSession(s.user.id, s.sessionId);
  await clearSessionCookie();
  return json({ ok: true });
});
