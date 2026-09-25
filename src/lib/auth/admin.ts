import type { PublicUser } from "./types";
import { error } from "../http";
import { currentUser } from "./session";

/** The signed-in back-office user, or an error response. */
export async function requireAdmin(): Promise<{ ok: true; user: PublicUser } | { ok: false; response: Response }> {
  const user = await currentUser();
  if (!user) return { ok: false, response: error("unauthorized", 401) };
  if (!user.isAdmin) return { ok: false, response: error("forbidden", 403) };
  return { ok: true, user };
}
