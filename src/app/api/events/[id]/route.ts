import { getEvent, minPriceSAR, openSessions } from "@/lib/events/orders";
import { error, handle, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const e = await getEvent((await params).id);
  if (!e) return error("notFound", 404);
  return json({ event: { ...e, sessions: openSessions(e), minPriceSAR: minPriceSAR(e) } });
});
