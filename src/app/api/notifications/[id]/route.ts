import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { deleteNotification } from "@/lib/reminders/reminders";

export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const { id } = await ctx.params;
  if (!(await deleteNotification(user.id, id))) return error("notFound", 404);
  return json({ ok: true });
});
