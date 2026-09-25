import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { deleteWalletDocument } from "@/lib/wallet";

export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  return (await deleteWalletDocument(user.id, (await params).id)) ? json({ ok: true }) : error("notFound", 404);
});
