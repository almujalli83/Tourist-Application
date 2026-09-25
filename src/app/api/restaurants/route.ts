import { handle, json } from "@/lib/http";
import { listRestaurants } from "@/lib/restaurants/catalog";

/** Bookable restaurants (MyTable / webook). */
export const GET = handle(async () => json({ restaurants: listRestaurants() }));
