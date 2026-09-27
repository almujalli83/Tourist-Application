import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import { TransferError, transferOptions, type ManualInput } from "@/lib/transfers/transfers";
import type { Direction } from "@/lib/transfers/types";

/** The ride (from a package, or entered by hand) and the companies' vehicles and prices. */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const input = await body<{ bookingId?: string; direction?: Direction; manual?: ManualInput }>(req);
  if (!input) return error("invalidRequest", 400);
  try {
    return json(await transferOptions(user, input));
  } catch (e) {
    if (e instanceof TransferError) return error(e.code, e.status);
    throw e;
  }
});
