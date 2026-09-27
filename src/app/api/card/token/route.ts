import QRCode from "qrcode";
import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { cardToken, getCard, OFFLINE_HOURS } from "@/lib/card/card";

/** Signed verification codes for a card: a rotating one (1 minute) and an offline one (12 hours). */
export const GET = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const url = new URL(req.url);
  const card = await getCard(user.id, url.searchParams.get("id") ?? "");
  if (!card) return error("notFound", 404);
  const locale = url.searchParams.get("locale") === "en" ? "en" : "ar";
  const link = (t: string) => `${url.origin}/${locale}/verify/card/${t}`;
  const live = cardToken(card);
  const offline = cardToken(card, new Date(), OFFLINE_HOURS * 3600);
  const svg = (t: string) => QRCode.toString(link(t), { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return json({
    live: { ...live, url: link(live.token), svg: await svg(live.token) },
    offline: { ...offline, url: link(offline.token), svg: await svg(offline.token) },
  });
});
