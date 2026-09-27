import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import type { CardInput } from "@/lib/payment";
import { topUpCard, TransitError } from "@/lib/transit/transit";

/** Tops up the transit card (darb in Riyadh). */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const input = await body<{ city?: string; cardNo?: string; amountSAR?: number; card?: CardInput }>(req);
  if (!input) return error("invalidRequest", 400);
  try {
    return json({ topup: await topUpCard(user, input) }, 201);
  } catch (e) {
    if (e instanceof TransitError) return error(e.code, e.status);
    throw e;
  }
});
