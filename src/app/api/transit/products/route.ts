import { error, handle, json } from "@/lib/http";
import { listProducts, TransitError } from "@/lib/transit/transit";

/** Tickets sold for a city's network (public). */
export const GET = handle(async (req: Request) => {
  try {
    return json(await listProducts(new URL(req.url).searchParams.get("city") ?? "RUH"));
  } catch (e) {
    if (e instanceof TransitError) return error(e.code, e.status);
    throw e;
  }
});
