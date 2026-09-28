import { recordPrivacyAck } from "@/lib/compliance/consent";
import { signedIn } from "@/lib/auth/respond";
import { toPublicUser } from "@/lib/auth/types";
import { handle, json } from "@/lib/http";
import { updateUser } from "@/lib/repo";

/** The user has read the current privacy policy. */
export const POST = handle(async () => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  const privacy = await recordPrivacyAck(s.userId, "banner");
  const u = await updateUser(s.userId, (x) => ({ ...x, privacy }));
  return json({ user: u ? toPublicUser(u) : null });
});
