import { error, handle, json } from "@/lib/http";
import { searchStays, StayError } from "@/lib/standalone/stays";

/** ?city=&checkIn=&checkOut=&rooms=[{"adults":2,"childAges":[5]}]&umrah=1 — licensed 3–5★ hotels from every agent. */
export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  let rooms: unknown = [];
  try {
    rooms = JSON.parse(q.get("rooms") ?? "[]");
  } catch {
    return error("rooms");
  }
  try {
    return json(await searchStays({ city: q.get("city") ?? "", checkIn: q.get("checkIn") ?? "", checkOut: q.get("checkOut") ?? "", rooms: rooms as never, umrah: q.get("umrah") === "1", entry: (q.get("entry") ?? undefined) as never }));
  } catch (e) {
    if (e instanceof StayError) return error(e.code, e.status);
    throw e;
  }
});
