import { getSaudiCity } from "@/lib/data/cities";
import { isValidISODate } from "@/lib/dates";
import { body, error, handle, json } from "@/lib/http";
import { loadPools, resolveRef } from "@/lib/planner/catalog";
import { partyFor } from "@/lib/planner/generate";
import type { PlanItem } from "@/lib/planner/types";
import type { RoomOccupancy } from "@/lib/types";

/** { city, date, rooms } → what can be added to or swapped into that day (places, restaurants, events that day). */
export const POST = handle(async (req: Request) => {
  const b = await body<{ city?: string; date?: string; rooms?: RoomOccupancy[] }>(req);
  const city = String(b?.city ?? "").toUpperCase();
  const date = String(b?.date ?? "");
  if (!getSaudiCity(city) || !isValidISODate(date)) return error("invalidBody");
  const rooms = Array.isArray(b?.rooms) ? b.rooms.map((r) => ({ adults: Math.max(1, Number(r?.adults) || 1), childAges: Array.isArray(r?.childAges) ? r.childAges.map(Number).filter((n) => n >= 0 && n < 18) : [] })) : [{ adults: 1, childAges: [] }];
  const pool = (await loadPools([city], date, date)).get(city)!;
  const party = partyFor({ rooms });
  const refs = [
    ...pool.places.map((p) => ({ ref: `place:${p.id}`, meal: p.category === "restaurant" || p.category === "cafe" ? "dinner" : undefined })),
    ...pool.restaurants.map((r) => ({ ref: `restaurant:${r.id}`, meal: "dinner" })),
    ...pool.events.flatMap((e) => e.slots.map((s) => ({ ref: `event:${e.event.id}@${s.date}T${s.time}`, meal: undefined }))),
  ];
  const items = refs.map((r) => resolveRef(r.ref, pool, date, party, { meal: r.meal })).filter((x): x is PlanItem => !!x);
  return json({ items });
});
