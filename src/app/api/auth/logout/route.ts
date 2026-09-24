import { clearSessionCookie } from "@/lib/auth/session";
import { json } from "@/lib/http";

export async function POST() {
  await clearSessionCookie();
  return json({ ok: true });
}
