import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import { bookStay, listStays, StayError, type StayBookingInput } from "@/lib/standalone/stays";

export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  return json({ stays: await listStays(user.id) });
});

/** Books a hotel rate (paid online now, or at the hotel). */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const b = await body<StayBookingInput>(req);
  if (!b) return error("invalidBody");
  try {
    return json({ stay: await bookStay(user, b) }, 201);
  } catch (e) {
    if (e instanceof StayError) return error(e.code, e.status);
    throw e;
  }
});
