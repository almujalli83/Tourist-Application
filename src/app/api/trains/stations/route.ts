import { handle, json } from "@/lib/http";
import { LINES, METRO_STATIONS, STATIONS } from "@/lib/trains/network";

export const GET = handle(async () => json({ stations: STATIONS, lines: LINES, metro: METRO_STATIONS }));
