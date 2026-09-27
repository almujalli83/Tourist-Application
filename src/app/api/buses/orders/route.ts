import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import { BusOrderError, createBusOrder, listBusOrders, type BusOrderInput } from "@/lib/buses/orders";

export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  return json({ orders: await listBusOrders(user.id) });
});

/** Books bus tickets on chosen seats (paid by card, issued by the operator). */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const input = await body<BusOrderInput>(req);
  if (!input) return error("invalidRequest", 400);
  try {
    return json({ order: await createBusOrder(user, input) }, 201);
  } catch (e) {
    if (e instanceof BusOrderError) return error(e.code, e.status);
    throw e;
  }
});
