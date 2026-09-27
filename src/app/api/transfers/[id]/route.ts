import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { cancelTransfer, getTransfer, TransferError } from "@/lib/transfers/transfers";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const t = await getTransfer(user.id, (await params).id);
  return t ? json({ transfer: t }) : error("notFound", 404);
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  try {
    return json({ transfer: await cancelTransfer(user.id, (await params).id) });
  } catch (e) {
    if (e instanceof TransferError) return error(e.code, e.status);
    throw e;
  }
});
