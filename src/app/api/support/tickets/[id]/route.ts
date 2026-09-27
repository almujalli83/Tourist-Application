import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import { getMyTicket, SupportError, travellerClose, travellerReply } from "@/lib/support/tickets";

export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

const wrap = async (fn: () => Promise<Response>) => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof SupportError) return error(e.code, e.status);
    throw e;
  }
};

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const { id } = await params;
  return wrap(async () => json({ ticket: await getMyTicket(user.id, id) }));
});

/** { message, attachments? } — a reply; or { action: "close" }. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const { id } = await params;
  const b = await body<{ message?: unknown; attachments?: unknown; action?: string }>(req);
  if (!b) return error("invalidBody", 400);
  return wrap(async () => json({ ticket: b.action === "close" ? await travellerClose(user.id, id) : await travellerReply(user, id, b) }));
});
