import { signedIn } from "@/lib/auth/respond";
import { getUserById } from "@/lib/repo";
import { handle, json } from "@/lib/http";

export const GET = handle(async () => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  const u = await getUserById(s.userId);
  return json({ enabled: !!u?.mfa, enabledAt: u?.mfa?.enabledAt ?? null, recoveryLeft: u?.mfa?.recovery.length ?? 0 });
});
