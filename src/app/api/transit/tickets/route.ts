import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import type { CardInput } from "@/lib/payment";
import { buyTickets, listTickets, listTopUps, TransitError } from "@/lib/transit/transit";

export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  return json({ tickets: await listTickets(user.id), topups: await listTopUps(user.id) });
});

/** Buys metro & bus tickets (paid by card, issued by the operator). */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const input = await body<{ city?: string; productId?: string; qty?: number; expectedTotalSAR?: number; card?: CardInput }>(req);
  if (!input) return error("invalidRequest", 400);
  try {
    return json({ tickets: await buyTickets(user, input) }, 201);
  } catch (e) {
    if (e instanceof TransitError) return error(e.code, e.status);
    throw e;
  }
});
