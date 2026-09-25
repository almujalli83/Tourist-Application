import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { cancelTrainOrder, TrainOrderError } from "@/lib/trains/orders";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  try {
    return json({ order: await cancelTrainOrder(user, (await params).id) });
  } catch (e) {
    if (e instanceof TrainOrderError) return error(e.code, e.status);
    throw e;
  }
});
