import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { cancelPermit, PermitError } from "@/lib/umrah/permits";

/** Cancels a permit (the seat is released in Nusuk). */
export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  try {
    return json({ permit: await cancelPermit(user.id, (await params).id) });
  } catch (e) {
    if (e instanceof PermitError) return error(e.code, e.status);
    throw e;
  }
});
