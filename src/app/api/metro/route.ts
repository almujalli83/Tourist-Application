import { handle, json } from "@/lib/http";
import { getMetro } from "@/lib/metro/provider";

/** Riyadh Metro stations (public). */
export const GET = handle(async () => json(await getMetro()));
