import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { getIntent, PayError, voidIntent } from "@/lib/payments/intents";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  try {
    return json({ intent: await getIntent(user.id, (await params).id) });
  } catch (e) {
    if (e instanceof PayError) return error(e.code, e.status);
    throw e;
  }
});

/** Releases an authorization no order used. */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  try {
    return json({ intent: await voidIntent(user.id, (await params).id) });
  } catch (e) {
    if (e instanceof PayError) return error(e.code, e.status);
    throw e;
  }
});
