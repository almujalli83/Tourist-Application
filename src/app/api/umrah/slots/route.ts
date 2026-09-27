import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { availableSlots, PermitError } from "@/lib/umrah/permits";

/** Times Nusuk offers (?trip=&type=umrah|rawdah&date=&people=&group=men|women). */
export const GET = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const q = new URL(req.url).searchParams;
  const type = q.get("type");
  const people = Number(q.get("people") ?? 1);
  if ((type !== "umrah" && type !== "rawdah") || !Number.isInteger(people) || people < 1 || people > 20) return error("invalidRequest", 400);
  const group = q.get("group");
  try {
    return json({ slots: await availableSlots(user.id, { tripKey: q.get("trip") ?? "", type, date: q.get("date") ?? "", people, ...(group === "men" || group === "women" ? { group } : {}) }) });
  } catch (e) {
    if (e instanceof PermitError) return error(e.code, e.status);
    throw e;
  }
});
