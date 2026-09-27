/**
 * Intercity bus operators (SAPTCO…), connected by API: trips between cities, seat maps, booking
 * named tickets on chosen seats, and cancellation with the operator's refund.
 *
 * Linked operators are configured in BUS_PROVIDERS (JSON array):
 *   [{ "id": "saptco", "nameAr": "سابتكو", "nameEn": "SAPTCO", "url": "https://…/v1", "token": "…" }]
 * Expected endpoints (to be matched with the operator's specification):
 *   GET    {url}/trips?from&to&date                → [BusTrip]
 *   GET    {url}/trips/{id}/seats                  → { rows, letters, aisleAfter, taken }
 *   POST   {url}/bookings { tripId, seats, passengers:[{ nameEn, nationality, passportNo, type }], reference }
 *                                                  → { pnr, tickets: [{ seat, code }] }
 *   DELETE {url}/bookings/{pnr}                    → { refundSAR }
 * Sandbox (no MT credentials): SAPTCO is simulated between the main cities with a sample
 * timetable and fares. Off with DEMO_BUSES=off.
 */
import { createHash, randomBytes } from "node:crypto";
import { mtConfig } from "../config";
import { cityName, getStayCity } from "../data/cities";
import { distanceKm } from "../guide/geo";
import { CITY_CENTERS } from "../guide/centers";
import type { BusClass, BusSeatMap, BusTrip } from "./types";

export class BusProviderError extends Error {
  constructor(public code: "unavailable" | "rejected") {
    super(code);
  }
}

export interface BusProvider {
  id: string;
  nameAr: string;
  nameEn: string;
  sandbox: boolean;
  search(from: string, to: string, day: string): Promise<BusTrip[]>;
  seats(tripId: string): Promise<BusSeatMap>;
  book(r: { tripId: string; seats: string[]; passengers: { nameEn: string; nationality: string; passportNo: string; type: string }[]; reference: string }): Promise<{ pnr: string; codes: string[] }>;
  cancel(pnr: string, trip: BusTrip, totalSAR: number, now: Date): Promise<{ refundSAR: number }>;
}

/* ------------------------------------------------------------------ API */

interface OperatorConfig { id: string; nameAr?: string; nameEn?: string; url: string; token?: string }

function readConfig(): OperatorConfig[] {
  try {
    const list = JSON.parse(process.env.BUS_PROVIDERS ?? "[]") as OperatorConfig[];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.id === "string" && typeof p.url === "string") : [];
  } catch {
    return [];
  }
}

function apiProvider(c: OperatorConfig): BusProvider {
  const base = c.url.replace(/\/$/, "");
  const call = async (path: string, init: RequestInit = {}) => {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        ...init,
        headers: { accept: "application/json", "content-type": "application/json", ...(c.token ? { authorization: `Bearer ${c.token}` } : {}) },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new BusProviderError("unavailable");
    }
    if (res.status >= 400 && res.status < 500) throw new BusProviderError("rejected");
    if (!res.ok) throw new BusProviderError("unavailable");
    return res.status === 204 ? null : ((await res.json().catch(() => null)) as unknown);
  };
  return {
    id: c.id, nameAr: c.nameAr || c.nameEn || c.id, nameEn: c.nameEn || c.id, sandbox: false,
    async search(from, to, day) {
      const b = await call(`/trips?from=${from}&to=${to}&date=${day}`);
      return ((Array.isArray(b) ? b : ((b as { data?: unknown[] })?.data ?? [])) as Record<string, unknown>[])
        .filter((t) => typeof t.id === "string" && typeof t.depart === "string" && Number((t.fare as { adult?: unknown })?.adult) > 0)
        .map((t) => ({ ...(t as unknown as BusTrip), providerId: c.id, cls: t.cls === "vip" ? "vip" : "standard" }));
    },
    async seats(tripId) {
      const b = (await call(`/trips/${encodeURIComponent(tripId)}/seats`)) as Partial<BusSeatMap> | null;
      if (!b || !Number(b.rows) || !Array.isArray(b.letters)) throw new BusProviderError("unavailable");
      return { rows: Number(b.rows), letters: b.letters.map(String), aisleAfter: Number(b.aisleAfter ?? 2), taken: Array.isArray(b.taken) ? b.taken.map(String) : [] };
    },
    async book(r) {
      const b = (await call("/bookings", { method: "POST", body: JSON.stringify(r) })) as { pnr?: unknown; tickets?: { seat?: unknown; code?: unknown }[] } | null;
      const codes = r.seats.map((s) => b?.tickets?.find((t) => t.seat === s)?.code).filter((x): x is string => typeof x === "string");
      if (typeof b?.pnr !== "string" || codes.length !== r.seats.length) throw new BusProviderError("rejected");
      return { pnr: b.pnr, codes };
    },
    async cancel(pnr) {
      const b = (await call(`/bookings/${encodeURIComponent(pnr)}`, { method: "DELETE" })) as { refundSAR?: unknown } | null;
      return { refundSAR: Math.max(0, Number(b?.refundSAR ?? 0)) };
    },
  };
}

/* -------------------------------------------------------------- sandbox */

const DEPARTURES = ["06:30", "10:00", "14:00", "18:30", "23:00"];
const KMH = 85;
const LAYOUT: Record<BusClass, { rows: number; letters: string[]; aisleAfter: number }> = {
  standard: { rows: 12, letters: ["A", "B", "C", "D"], aisleAfter: 2 },
  vip: { rows: 10, letters: ["A", "B", "C"], aisleAfter: 1 },
};
const round5 = (n: number) => Math.round(n / 5) * 5;
const h = (s: string) => createHash("sha256").update(s).digest();
const terminal = (code: string) => ({ ar: `محطة سابتكو — ${cityName(code, "ar")}`, en: `SAPTCO terminal — ${cityName(code, "en")}` });

/** Refund in the sandbox: full until 24 h before departure, half until 2 h, none after. */
export function sandboxRefund(departIso: string, totalSAR: number, now: Date): number {
  const hrs = (Date.parse(departIso) - now.getTime()) / 3_600_000;
  return hrs >= 24 ? totalSAR : hrs >= 2 ? Math.round(totalSAR * 50) / 100 : 0;
}

function sandboxTrips(from: string, to: string, day: string): BusTrip[] {
  const a = CITY_CENTERS[from];
  const b = CITY_CENTERS[to];
  if (!a || !b || from === to || from === "MKX" || to === "MKX") return [];
  const km = distanceKm(a, b) * 1.25;
  if (km < 80) return [];
  const mins = Math.round((km / KMH) * 60 + 30);
  const out: BusTrip[] = [];
  DEPARTURES.forEach((time, i) => {
    for (const cls of ["standard", "vip"] as BusClass[]) {
      if (cls === "vip" && i % 2 === 1) continue;
      const depart = Date.parse(`${day}T${time}:00+03:00`);
      const tripNo = `SP${from}${to}${i + 1}${cls === "vip" ? "V" : ""}`;
      const id = `${tripNo}-${day.replace(/-/g, "")}`;
      const adult = Math.max(60, round5(km * (cls === "vip" ? 0.4 : 0.25)));
      const L = LAYOUT[cls];
      const total = L.rows * L.letters.length;
      out.push({
        id, providerId: "saptco", tripNo, from, to, fromTerminal: terminal(from).en, toTerminal: terminal(to).en,
        depart: new Date(depart).toISOString(), arrive: new Date(depart + mins * 60_000).toISOString(), durationMins: mins, cls,
        fare: { adult, child: round5(adult * 0.5) }, seatsLeft: total - (h(id)[0] % Math.floor(total / 2)),
      });
    }
  });
  return out;
}

/** Seats sold by others in the sandbox (stable per trip). */
export function sandboxTaken(tripId: string, cls: BusClass): string[] {
  const L = LAYOUT[cls];
  const all = Array.from({ length: L.rows }, (_, r) => L.letters.map((l) => `${r + 1}${l}`)).flat();
  const hash = h(tripId);
  return all.filter((_, i) => hash[i % hash.length] % 3 === 0);
}

const sandboxProvider: BusProvider = {
  id: "saptco", nameAr: "سابتكو (تجريبي)", nameEn: "SAPTCO (sample)", sandbox: true,
  async search(from, to, day) {
    return sandboxTrips(from, to, day);
  },
  async seats(tripId) {
    const cls: BusClass = /V-\d{8}$/.test(tripId) ? "vip" : "standard";
    return { ...LAYOUT[cls], taken: sandboxTaken(tripId, cls) };
  },
  async book(r) {
    return { pnr: `SBX${randomBytes(3).toString("hex").toUpperCase()}`, codes: r.seats.map(() => `SAP${randomBytes(5).toString("hex").toUpperCase()}`) };
  },
  async cancel(_pnr, trip, totalSAR, now) {
    return { refundSAR: sandboxRefund(trip.depart, totalSAR, now) };
  },
};

export const terminalName = (code: string, locale: "ar" | "en") => terminal(code)[locale];

/** The intercity bus operators: linked by API, else SAPTCO simulated in the sandbox. */
export function busProviders(): BusProvider[] {
  const linked = readConfig().map(apiProvider);
  if (linked.length) return linked;
  return mtConfig().mock && process.env.DEMO_BUSES !== "off" ? [sandboxProvider] : [];
}

export function busProviderById(id: string): BusProvider | null {
  return busProviders().find((p) => p.id === id) ?? null;
}

/** Cities with bus service (the main cities; Makkah is reached through Jeddah). */
export const busCities = () => Object.keys(CITY_CENTERS).filter((c) => c !== "MKX" && getStayCity(c));
