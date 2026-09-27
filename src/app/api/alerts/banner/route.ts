import { currentUser } from "@/lib/auth/session";
import { handle, json } from "@/lib/http";
import { weatherBanner } from "@/lib/alerts/alerts";

/** Today's weather alert for the traveller's trip (shown as a banner). */
export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return json({ alert: null });
  const a = await weatherBanner(user.id);
  return json({ alert: a && { id: a.id, severity: a.severity ?? "warning", titleAr: a.titleAr, titleEn: a.titleEn, lineAr: a.linesAr[0], lineEn: a.linesEn[0], demo: !!a.demo } });
});
