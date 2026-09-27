import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import { PayError, sandboxThreeDs } from "@/lib/payments/intents";

/** Sandbox bank page: approve or fail 3-D Secure. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const input = await body<{ approve?: boolean }>(req);
  try {
    return json({ intent: await sandboxThreeDs(user.id, (await params).id, input?.approve === true) });
  } catch (e) {
    if (e instanceof PayError) return error(e.code, e.status);
    throw e;
  }
});
