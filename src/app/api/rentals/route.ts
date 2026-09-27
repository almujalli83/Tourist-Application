import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import { listRentals, RentalError, requestRental, type RentalRequestInput } from "@/lib/rentals/rentals";

export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  return json({ rentals: await listRentals(user.id) });
});

/** Books the chosen car with the rental company (paid at the counter). */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const input = await body<RentalRequestInput>(req);
  if (!input || typeof input.quoteId !== "string" || typeof input.providerId !== "string") return error("invalidRequest", 400);
  try {
    return json({ rental: await requestRental(user, input) }, 201);
  } catch (e) {
    if (e instanceof RentalError) return error(e.code, e.status);
    throw e;
  }
});
