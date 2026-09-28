import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import type { CardInput } from "@/lib/payment";
import { changeStayDates, quoteStayChange, StayError } from "@/lib/standalone/stays";
import type { HotelOffer } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

const fail = (e: unknown) => {
  if (e instanceof StayError) return error(e.code, e.status);
  throw e;
};

/** ?checkIn=&checkOut= — the same hotel and room on new dates, and the difference to pay or refund. */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const q = new URL(req.url).searchParams;
  try {
    return json(await quoteStayChange(user.id, (await ctx.params).id, { checkIn: q.get("checkIn") ?? "", checkOut: q.get("checkOut") ?? "" }));
  } catch (e) {
    return fail(e);
  }
});

/** { offer, card? } — moves the booking to the quoted dates. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const b = await body<{ offer?: HotelOffer; card?: CardInput }>(req);
  try {
    return json({ stay: await changeStayDates(user, (await ctx.params).id, b ?? {}) });
  } catch (e) {
    return fail(e);
  }
});
