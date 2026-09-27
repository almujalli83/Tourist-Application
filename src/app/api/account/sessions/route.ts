import { signedIn } from "@/lib/auth/respond";
import { listSessions, revokeAllSessions } from "@/lib/auth/sessions";
import { handle, json } from "@/lib/http";

/** Signed-in devices. */
export const GET = handle(async () => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  const rows = await listSessions(s.userId);
  return json({ sessions: rows.map((r) => ({ id: r.id, device: r.device, method: r.method, createdAt: r.createdAt, lastSeenAt: r.lastSeenAt, current: r.id === s.sessionId })) });
});

/** Signs out every other device. */
export const DELETE = handle(async () => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  return json({ revoked: await revokeAllSessions(s.userId, s.sessionId) });
});
