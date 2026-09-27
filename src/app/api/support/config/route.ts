import { aiConfigured } from "@/lib/assistant/claude";
import { handle, json } from "@/lib/http";
import { complaintsUrl } from "@/lib/reviews/reviews";

/** Public support settings: WhatsApp number (SUPPORT_WHATSAPP) and whether the AI answers first. */
export const GET = handle(async () => {
  const wa = (process.env.SUPPORT_WHATSAPP ?? "").replace(/[^\d]/g, "");
  return json({ whatsapp: wa.length >= 8 ? wa : null, ai: aiConfigured(), complaintsUrl: complaintsUrl() });
});
