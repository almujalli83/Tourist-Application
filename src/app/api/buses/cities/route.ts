import { handle, json } from "@/lib/http";
import { busCities, busProviders } from "@/lib/buses/provider";

/** Cities with intercity buses and the operators (public). */
export const GET = handle(async () => json({ cities: busCities(), operators: busProviders().map((p) => ({ id: p.id, nameAr: p.nameAr, nameEn: p.nameEn, sandbox: p.sandbox })) }));
