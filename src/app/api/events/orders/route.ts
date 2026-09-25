import { currentUser } from "@/lib/auth/session";
import { EventOrderError, listOrders, placeOrder, type OrderInput } from "@/lib/events/orders";
import { body, error, handle, json } from "@/lib/http";

export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  return json({ orders: await listOrders(user.id) });
});

export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const input = await body<OrderInput>(req);
  if (!input?.card || typeof input.eventId !== "string" || typeof input.sessionId !== "string") return error("invalidRequest", 400);
  try {
    return json({ order: await placeOrder(user, input) }, 201);
  } catch (e) {
    if (e instanceof EventOrderError) return error(e.code, e.status);
    throw e;
  }
});
