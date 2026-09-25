import { availability, getEvent, openSessions } from "@/lib/events/orders";
import { error, handle, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** ?session=… — taken seats (seated events) or remaining tickets per type. */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const e = await getEvent((await params).id);
  const sessionId = new URL(req.url).searchParams.get("session") ?? "";
  if (!e || !openSessions(e).some((s) => s.id === sessionId)) return error("notFound", 404);
  return json(await availability(e, sessionId));
});
