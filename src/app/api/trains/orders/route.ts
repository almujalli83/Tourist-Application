import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import { listTrainOrders, placeTrainOrder, TrainOrderError, type TrainOrderInput } from "@/lib/trains/orders";

export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  return json({ orders: await listTrainOrders(user.id) });
});

export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const input = await body<TrainOrderInput>(req);
  if (!input?.card || !Array.isArray(input.legs) || !Array.isArray(input.passengers)) return error("invalidRequest", 400);
  try {
    return json({ order: await placeTrainOrder(user, input) }, 201);
  } catch (e) {
    if (e instanceof TrainOrderError) return error(e.code, e.status);
    throw e;
  }
});
