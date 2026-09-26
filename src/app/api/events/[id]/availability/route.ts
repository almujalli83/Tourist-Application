import { availability, getEventForSession, openSessions } from "@/lib/events/orders";
import { error, handle, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** ?session=… — taken seats (seated events) or remaining tickets per type. */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const sessionId = new URL(req.url).searchParams.get("session") ?? "";
  const e = await getEventForSession((await params).id, sessionId);
  if (!e || !openSessions(e).some((s) => s.id === sessionId)) return error("notFound", 404);
  return json(await availability(e, sessionId));
});
