/**
 * Transfer companies, connected by API. Each provider implements the same interface: quotes for a
 * ride, booking, status (with the driver once assigned) and cancellation.
 *
 * Linked companies are configured in TRANSFER_PROVIDERS (JSON array):
 *   [{ "id": "acme", "nameAr": "…", "nameEn": "…", "url": "https://api.acme.sa/v1", "token": "…", "airports": ["RUH", "JED"] }]
 * Expected endpoints (to be matched with each company's specification):
 *   POST   {url}/quotes              { direction, airport, flightNo, flightAt, pickupAt, place, pax, bags }
 *                                    → [{ quoteId, vehicle, priceSAR, freeWaitMins?, freeCancelHours? }]
 *   POST   {url}/bookings            { quoteId, direction, airport, flightNo, flightAt, pickupAt, place, pax, bags, extras, notes, leadName, phone, reference }
 *                                    → { ref, status: "requested" | "confirmed" | "rejected", driver? }
 *   GET    {url}/bookings/{ref}      → { status, driver? }
 *   DELETE {url}/bookings/{ref}
 * Sandbox (no MT credentials): a simulated company with indicative prices; it confirms a request
 * and assigns a driver a few minutes after it is made. Off with DEMO_TRANSFERS=off.
 */
import { createHash, randomBytes } from "node:crypto";
import { mtConfig } from "../config";
import { distanceKm } from "../guide/geo";
import { AIRPORTS } from "../transport/rides";
import { VEHICLES, type Direction, type Driver, type Place, type TransferExtras, type TransferQuote, type TransferStatus, type Vehicle } from "./types";

export interface QuoteRequest { direction: Direction; airport: string; flightNo: string; flightAt: string; pickupAt: string; place: Place; pax: number; bags: number }
export interface BookRequest extends QuoteRequest { quoteId: string; vehicle: Vehicle; extras: TransferExtras; notes: string; leadName: string; phone: string; reference: string }

export class ProviderError extends Error {
  constructor(public code: "unavailable" | "rejected") {
    super(code);
  }
}

export interface TransferProvider {
  id: string;
  nameAr: string;
  nameEn: string;
  airports: string[];
  sandbox: boolean;
  quote(q: QuoteRequest): Promise<TransferQuote[]>;
  book(r: BookRequest, now: Date): Promise<{ ref: string; status: TransferStatus; driver: Driver | null }>;
  status(ref: string, createdAt: string, now: Date): Promise<{ status: TransferStatus; driver: Driver | null }>;
  cancel(ref: string): Promise<void>;
}

/* ------------------------------------------------------------------ API */

interface ProviderConfig { id: string; nameAr: string; nameEn: string; url: string; token?: string; airports: string[] }

function readConfig(): ProviderConfig[] {
  try {
    const list = JSON.parse(process.env.TRANSFER_PROVIDERS ?? "[]") as ProviderConfig[];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.id === "string" && typeof p.url === "string" && Array.isArray(p.airports)) : [];
  } catch {
    return [];
  }
}

const asDriver = (d: unknown): Driver | null => {
  const x = d as Partial<Driver> | null;
  return x && typeof x.name === "string" && typeof x.phone === "string" ? { name: x.name, phone: x.phone, car: String(x.car ?? ""), plate: String(x.plate ?? "") } : null;
};
const asStatus = (s: unknown): TransferStatus => (["requested", "confirmed", "rejected", "cancelled", "completed"].includes(String(s)) ? (s as TransferStatus) : "requested");

function apiProvider(c: ProviderConfig): TransferProvider {
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
      throw new ProviderError("unavailable");
    }
    if (res.status >= 400 && res.status < 500) throw new ProviderError("rejected");
    if (!res.ok) throw new ProviderError("unavailable");
    return res.status === 204 ? null : ((await res.json().catch(() => null)) as unknown);
  };
  return {
    id: c.id, nameAr: c.nameAr || c.nameEn || c.id, nameEn: c.nameEn || c.id, airports: c.airports.map((a) => a.toUpperCase()), sandbox: false,
    async quote(q) {
      const body = await call("/quotes", { method: "POST", body: JSON.stringify(q) });
      const rows = (Array.isArray(body) ? body : ((body as { data?: unknown[] })?.data ?? [])) as Record<string, unknown>[];
      return rows
        .filter((r) => typeof r.quoteId === "string" && (VEHICLES as readonly string[]).includes(String(r.vehicle)) && Number(r.priceSAR) > 0)
        .map((r) => ({
          quoteId: r.quoteId as string, providerId: c.id, providerNameAr: c.nameAr || c.nameEn, providerNameEn: c.nameEn || c.id,
          vehicle: r.vehicle as Vehicle, priceSAR: Math.round(Number(r.priceSAR) * 100) / 100,
          freeWaitMins: Number(r.freeWaitMins ?? 60), freeCancelHours: Number(r.freeCancelHours ?? 12),
        }));
    },
    async book(r) {
      const body = (await call("/bookings", { method: "POST", body: JSON.stringify(r) })) as Record<string, unknown> | null;
      if (!body || typeof body.ref !== "string") throw new ProviderError("rejected");
      return { ref: body.ref, status: asStatus(body.status), driver: asDriver(body.driver) };
    },
    async status(ref) {
      const body = (await call(`/bookings/${encodeURIComponent(ref)}`)) as Record<string, unknown> | null;
      // An empty or unknown answer never changes what we know.
      if (!body || !["requested", "confirmed", "rejected", "cancelled", "completed"].includes(String(body.status))) throw new ProviderError("unavailable");
      return { status: asStatus(body.status), driver: asDriver(body.driver) };
    },
    async cancel(ref) {
      await call(`/bookings/${encodeURIComponent(ref)}`, { method: "DELETE" });
    },
  };
}

/* -------------------------------------------------------------- sandbox */

/** Indicative prices (SAR): a base fare plus a rate per km from the airport. */
const SANDBOX_TARIFF: Record<Vehicle, { base: number; perKm: number }> = {
  sedan: { base: 90, perKm: 2.4 }, suv: { base: 140, perKm: 3.2 }, van: { base: 190, perKm: 4 }, vip: { base: 320, perKm: 5.5 },
};
/** A request is confirmed with a driver this long after it is made (simulated). */
export const SANDBOX_CONFIRM_MINUTES = 2;

const DRIVERS: Driver[] = [
  { name: "Faisal Al-Otaibi", phone: "+966500000301", car: "Toyota Camry — white", plate: "أ ب ج 1234" },
  { name: "Majed Al-Ghamdi", phone: "+966500000302", car: "GMC Yukon — black", plate: "د ر س 5678" },
  { name: "Saad Al-Dosari", phone: "+966500000303", car: "Hyundai H1 — silver", plate: "ص ط ع 9012" },
];

const SANDBOX_NAME = { ar: "ترانسفير السعودية (تجريبي)", en: "Saudi Transfers (sample)" };

const sandboxProvider: TransferProvider = {
  id: "sandbox", nameAr: SANDBOX_NAME.ar, nameEn: SANDBOX_NAME.en, airports: Object.keys(AIRPORTS), sandbox: true,
  async quote(q) {
    const ap = AIRPORTS[q.airport];
    if (!ap) return [];
    // Straight line × 1.3 for the road; without the place's location, the city-centre distance is assumed (20 km).
    const km = q.place.lat !== null && q.place.lng !== null ? distanceKm(ap, { lat: q.place.lat, lng: q.place.lng }) * 1.3 : 20;
    return VEHICLES.map((v) => ({
      quoteId: `sbx-${v}-${createHash("sha256").update(JSON.stringify([q.airport, q.place, q.flightAt, v])).digest("hex").slice(0, 12)}`,
      providerId: "sandbox", providerNameAr: SANDBOX_NAME.ar, providerNameEn: SANDBOX_NAME.en, vehicle: v,
      priceSAR: Math.round((SANDBOX_TARIFF[v].base + SANDBOX_TARIFF[v].perKm * km) / 5) * 5,
      freeWaitMins: 60, freeCancelHours: 12, sandbox: true,
    }));
  },
  async book() {
    return { ref: `SBX-TR-${randomBytes(3).toString("hex").toUpperCase()}`, status: "requested", driver: null };
  },
  async status(ref, createdAt, now) {
    if (now.getTime() - Date.parse(createdAt) < SANDBOX_CONFIRM_MINUTES * 60_000) return { status: "requested", driver: null };
    const n = createHash("sha256").update(ref).digest()[0] % DRIVERS.length;
    return { status: "confirmed", driver: DRIVERS[n] };
  },
  async cancel() {
    /* nothing to release in the simulation */
  },
};

/** Providers serving an airport: the linked companies, else the sandbox one (sandbox mode). */
export function providersFor(airport: string): TransferProvider[] {
  const linked = readConfig().map(apiProvider).filter((p) => p.airports.includes(airport));
  if (linked.length) return linked;
  return mtConfig().mock && process.env.DEMO_TRANSFERS !== "off" && AIRPORTS[airport] ? [sandboxProvider] : [];
}

export function providerById(id: string): TransferProvider | null {
  if (id === "sandbox") return sandboxProvider;
  const c = readConfig().find((p) => p.id === id);
  return c ? apiProvider(c) : null;
}
