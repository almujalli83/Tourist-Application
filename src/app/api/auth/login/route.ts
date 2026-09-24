import { verifyPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { toPublicUser } from "@/lib/auth/types";
import { read } from "@/lib/db";
import { body, error, json } from "@/lib/http";

export async function POST(req: Request) {
  const b = await body<{ email: string; password: string }>(req);
  const email = b?.email?.trim().toLowerCase() ?? "";
  const user = await read((db) => db.users.find((u) => u.email === email));
  if (!user || !b?.password || !(await verifyPassword(b.password, user.passwordHash))) return error("invalid", 401);
  await setSessionCookie(user.id);
  return json({ user: toPublicUser(user) });
}
