import { currentUser } from "@/lib/auth/session";
import { EsimError, listEsimOrders, placeEsimOrder, type EsimOrderInput } from "@/lib/esim/orders";
import { body, error, handle, json } from "@/lib/http";

export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  return json({ orders: await listEsimOrders(user.id) });
});

export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const input = await body<EsimOrderInput>(req);
  if (!input?.card || !Array.isArray(input.recipients)) return error("invalidRequest", 400);
  try {
    return json({ order: await placeEsimOrder(user, input) }, 201);
  } catch (e) {
    if (e instanceof EsimError) return error(e.code, e.status);
    throw e;
  }
});
