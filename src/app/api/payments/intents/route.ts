import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import { createIntent, PayError } from "@/lib/payments/intents";
import type { PaySource } from "@/lib/payments/types";

/** Authorizes an amount (card with 3-D Secure, saved card, Apple Pay, Google Pay, STC Pay). */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const input = await body<{ amountSAR?: number; description?: string; source?: PaySource; save?: boolean }>(req);
  if (!input) return error("invalidRequest", 400);
  try {
    return json({ intent: await createIntent(user, { ...input, returnUrl: new URL("/pay/return", req.url).toString() }) }, 201);
  } catch (e) {
    if (e instanceof PayError) return error(e.code, e.status);
    throw e;
  }
});
