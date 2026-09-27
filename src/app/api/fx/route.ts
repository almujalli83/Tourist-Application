import { handle, json } from "@/lib/http";
import { getRates } from "@/lib/fx";

/** Exchange rates (units per 1 SAR), with the time and source of the last update (public). */
export const GET = handle(async () => json(await getRates()));
