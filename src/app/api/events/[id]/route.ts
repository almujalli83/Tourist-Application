import { getEventForSession, minPriceSAR, openSessions } from "@/lib/events/orders";
import { error, handle, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** The event and its sessions on sale; `?session=` also includes that session's day when it is further ahead. */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const e = await getEventForSession((await params).id, new URL(req.url).searchParams.get("session"));
  if (!e) return error("notFound", 404);
  return json({ event: { ...e, sessions: openSessions(e), minPriceSAR: minPriceSAR(e) } });
});
