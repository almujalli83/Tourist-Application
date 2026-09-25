import { error, handle, json } from "@/lib/http";
import { getRestaurant } from "@/lib/restaurants/catalog";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const r = getRestaurant((await params).id);
  return r ? json({ restaurant: r }) : error("notFound", 404);
});
