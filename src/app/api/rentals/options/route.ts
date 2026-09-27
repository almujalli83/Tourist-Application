import { body, error, handle, json } from "@/lib/http";
import { RentalError, rentalOptions } from "@/lib/rentals/rentals";
import type { RentalQuery } from "@/lib/rentals/types";

/** Cars and prices from the rental companies, with the licence requirements (no sign-in needed). */
export const POST = handle(async (req: Request) => {
  const input = await body<Partial<RentalQuery>>(req);
  if (!input) return error("invalidRequest", 400);
  try {
    return json(await rentalOptions(input));
  } catch (e) {
    if (e instanceof RentalError) return error(e.code, e.status);
    throw e;
  }
});
