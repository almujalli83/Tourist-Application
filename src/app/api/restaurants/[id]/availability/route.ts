import { error, handle, json } from "@/lib/http";
import { availability } from "@/lib/restaurants/bookings";
import { getRestaurant } from "@/lib/restaurants/catalog";

type Ctx = { params: Promise<{ id: string }> };

/** ?day=YYYY-MM-DD — seating times with covers left. */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const r = getRestaurant((await params).id);
  if (!r) return error("notFound", 404);
  return json({ slots: await availability(r, new URL(req.url).searchParams.get("day") ?? "") });
});
