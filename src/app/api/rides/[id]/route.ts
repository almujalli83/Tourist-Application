import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { cancelRide, getRide, RideError } from "@/lib/rides/rides";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const r = await getRide(user.id, (await params).id);
  return r ? json({ ride: r }) : error("notFound", 404);
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  try {
    return json({ ride: await cancelRide(user.id, (await params).id) });
  } catch (e) {
    if (e instanceof RideError) return error(e.code, e.status);
    throw e;
  }
});
