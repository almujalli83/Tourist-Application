import { currentUser } from "@/lib/auth/session";
import { cancelEsimOrder, EsimError } from "@/lib/esim/orders";
import { error, handle, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  try {
    return json({ order: await cancelEsimOrder(user, (await params).id) });
  } catch (e) {
    if (e instanceof EsimError) return error(e.code, e.status);
    throw e;
  }
});
