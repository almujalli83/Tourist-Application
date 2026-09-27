/**
 * Car rental companies, connected by API. Each provider implements the same interface: quotes
 * for a rental (cars, prices, extras and conditions), booking, status (confirmation number and
 * counter) and cancellation.
 *
 * Linked companies are configured in RENTAL_PROVIDERS (JSON array):
 *   [{ "id": "acme", "nameAr": "…", "nameEn": "…", "url": "https://api.acme.sa/v1", "token": "…", "cities": ["RUH", "JED"] }]
 * Expected endpoints (to be matched with each company's specification):
 *   POST   {url}/quotes          RentalQuery → [{ quoteId, carClass, model, seats, bags, automatic, pricePerDaySAR, oneWayFeeSAR?,
 *                                                depositSAR, kmPerDay?, extras?: { fullInsurance?, extraDriver?, childSeat?, gps? } (per day),
 *                                                minAge?, freeCancelHours? }]
 *   POST   {url}/bookings        { quoteId, …RentalQuery, extras: [..], driverName, phone, email, reference }
 *                                → { ref, status: "requested" | "confirmed" | "rejected", confirmation?, counter? }
 *   GET    {url}/bookings/{ref}  → { status, confirmation?, counter? }
 *   DELETE {url}/bookings/{ref}
 * Sandbox (no MT credentials): a simulated company with indicative prices; it confirms a request a
 * few minutes after it is made. Off with DEMO_RENTALS=off.
 */
import { createHash, randomBytes } from "node:crypto";
import { mtConfig } from "../config";
import { getStayCity } from "../data/cities";
import { CAR_CLASSES, RENTAL_EXTRAS, rentalDays, type CarClass, type RentalCounter, type RentalExtra, type RentalQuery, type RentalQuote, type RentalStatus } from "./types";

export interface RentalBookRequest extends RentalQuery { quoteId: string; extras: RentalExtra[]; driverName: string; phone: string; email: string; reference: string }
export interface RentalState { status: RentalStatus; confirmation: string | null; counter: RentalCounter | null }

export class RentalProviderError extends Error {
  constructor(public code: "unavailable" | "rejected") {
    super(code);
  }
}

export interface RentalProvider {
  id: string;
  nameAr: string;
  nameEn: string;
  cities: string[];
  sandbox: boolean;
  quote(q: RentalQuery): Promise<RentalQuote[]>;
  book(r: RentalBookRequest, now: Date): Promise<{ ref: string } & RentalState>;
  status(ref: string, createdAt: string, now: Date, q: RentalQuery): Promise<RentalState>;
  cancel(ref: string): Promise<void>;
}

const STATUSES: RentalStatus[] = ["requested", "confirmed", "rejected", "cancelled", "completed"];
const round = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ API */

interface ProviderConfig { id: string; nameAr: string; nameEn: string; url: string; token?: string; cities: string[] }

function readConfig(): ProviderConfig[] {
  try {
    const list = JSON.parse(process.env.RENTAL_PROVIDERS ?? "[]") as ProviderConfig[];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.id === "string" && p.id !== "sandbox" && typeof p.url === "string" && Array.isArray(p.cities)) : [];
  } catch {
    return [];
  }
}

const asCounter = (c: unknown): RentalCounter | null => {
  const x = c as Partial<RentalCounter> | null;
  return x && typeof x.name === "string" ? { name: x.name, phone: String(x.phone ?? ""), address: String(x.address ?? "") } : null;
};

function apiProvider(c: ProviderConfig): RentalProvider {
  const base = c.url.replace(/\/$/, "");
  const nameAr = c.nameAr || c.nameEn || c.id;
  const nameEn = c.nameEn || c.id;
  const call = async (path: string, init: RequestInit = {}) => {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        ...init,
        headers: { accept: "application/json", "content-type": "application/json", ...(c.token ? { authorization: `Bearer ${c.token}` } : {}) },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new RentalProviderError("unavailable");
    }
    if (res.status >= 400 && res.status < 500) throw new RentalProviderError("rejected");
    if (!res.ok) throw new RentalProviderError("unavailable");
    return res.status === 204 ? null : ((await res.json().catch(() => null)) as unknown);
  };
  const state = (body: Record<string, unknown> | null): RentalState => {
    if (!body || !STATUSES.includes(body.status as RentalStatus)) throw new RentalProviderError("unavailable");
    return { status: body.status as RentalStatus, confirmation: typeof body.confirmation === "string" ? body.confirmation : null, counter: asCounter(body.counter) };
  };
  return {
    id: c.id, nameAr, nameEn, cities: c.cities.map((x) => x.toUpperCase()), sandbox: false,
    async quote(q) {
      const body = await call("/quotes", { method: "POST", body: JSON.stringify(q) });
      const rows = (Array.isArray(body) ? body : ((body as { data?: unknown[] })?.data ?? [])) as Record<string, unknown>[];
      const days = rentalDays(q.pickupAt, q.returnAt);
      return rows
        .filter((r) => typeof r.quoteId === "string" && (CAR_CLASSES as readonly string[]).includes(String(r.carClass)) && Number(r.pricePerDaySAR) > 0)
        .map((r) => {
          const perDay = round(Number(r.pricePerDaySAR));
          const oneWay = round(Math.max(0, Number(r.oneWayFeeSAR ?? 0)));
          const ex = (r.extras ?? {}) as Record<string, unknown>;
          const extras: Partial<Record<RentalExtra, number>> = {};
          for (const k of RENTAL_EXTRAS) if (Number(ex[k]) > 0) extras[k] = round(Number(ex[k]) * days);
          return {
            quoteId: r.quoteId as string, providerId: c.id, providerNameAr: nameAr, providerNameEn: nameEn,
            carClass: r.carClass as CarClass, model: String(r.model ?? ""), seats: Number(r.seats ?? 5), bags: Number(r.bags ?? 2), automatic: r.automatic !== false,
            days, pricePerDaySAR: perDay, oneWayFeeSAR: oneWay, totalSAR: round(perDay * days + oneWay), depositSAR: round(Number(r.depositSAR ?? 0)),
            kmPerDay: r.kmPerDay == null ? null : Number(r.kmPerDay), extras, minAge: Number(r.minAge ?? 21), freeCancelHours: Number(r.freeCancelHours ?? 24),
          };
        });
    },
    async book(r) {
      const body = (await call("/bookings", { method: "POST", body: JSON.stringify(r) })) as Record<string, unknown> | null;
      if (!body || typeof body.ref !== "string") throw new RentalProviderError("rejected");
      const s = STATUSES.includes(body.status as RentalStatus) ? state(body) : { status: "requested" as const, confirmation: null, counter: null };
      return { ref: body.ref, ...s };
    },
    async status(ref) {
      return state((await call(`/bookings/${encodeURIComponent(ref)}`)) as Record<string, unknown> | null);
    },
    async cancel(ref) {
      await call(`/bookings/${encodeURIComponent(ref)}`, { method: "DELETE" });
    },
  };
}

/* -------------------------------------------------------------- sandbox */

/** Indicative daily prices (SAR) and example cars. */
const SANDBOX_CARS: Record<CarClass, { perDay: number; model: string; seats: number; bags: number; deposit: number; minAge: number }> = {
  economy: { perDay: 120, model: "Hyundai Accent", seats: 5, bags: 2, deposit: 1000, minAge: 21 },
  sedan: { perDay: 170, model: "Toyota Camry", seats: 5, bags: 3, deposit: 1500, minAge: 21 },
  suv: { perDay: 260, model: "Hyundai Tucson", seats: 5, bags: 4, deposit: 2000, minAge: 23 },
  "4x4": { perDay: 420, model: "Toyota Land Cruiser", seats: 7, bags: 5, deposit: 3000, minAge: 25 },
  luxury: { perDay: 650, model: "Mercedes-Benz E-Class", seats: 5, bags: 3, deposit: 5000, minAge: 25 },
};
const SANDBOX_EXTRAS: Record<RentalExtra, number> = { fullInsurance: 45, extraDriver: 25, childSeat: 20, gps: 15 };
const SANDBOX_ONE_WAY_SAR = 350;
/** A request is confirmed this long after it is made (simulated). */
export const SANDBOX_RENTAL_CONFIRM_MINUTES = 2;
const SANDBOX_NAME = { ar: "تأجير السعودية (تجريبي)", en: "Saudi Car Rental (sample)" };

const sandboxProvider: RentalProvider = {
  id: "sandbox", nameAr: SANDBOX_NAME.ar, nameEn: SANDBOX_NAME.en, cities: [], sandbox: true,
  async quote(q) {
    const days = rentalDays(q.pickupAt, q.returnAt);
    const oneWay = q.dropoffCity !== q.city ? SANDBOX_ONE_WAY_SAR : 0;
    return CAR_CLASSES.map((cls) => {
      const car = SANDBOX_CARS[cls];
      const extras: Partial<Record<RentalExtra, number>> = {};
      for (const k of RENTAL_EXTRAS) extras[k] = SANDBOX_EXTRAS[k] * days;
      return {
        quoteId: `sbx-${cls}-${createHash("sha256").update(JSON.stringify([q.city, q.pickupSpot, q.dropoffCity, q.dropoffSpot, q.pickupAt, q.returnAt, cls])).digest("hex").slice(0, 12)}`,
        providerId: "sandbox", providerNameAr: SANDBOX_NAME.ar, providerNameEn: SANDBOX_NAME.en,
        carClass: cls, model: car.model, seats: car.seats, bags: car.bags, automatic: true,
        days, pricePerDaySAR: car.perDay, oneWayFeeSAR: oneWay, totalSAR: car.perDay * days + oneWay, depositSAR: car.deposit,
        kmPerDay: cls === "luxury" ? 250 : null, extras, minAge: car.minAge, freeCancelHours: 24, sandbox: true,
      };
    });
  },
  async book() {
    return { ref: `SBX-CR-${randomBytes(3).toString("hex").toUpperCase()}`, status: "requested", confirmation: null, counter: null };
  },
  async status(ref, createdAt, now, q) {
    if (now.getTime() - Date.parse(createdAt) < SANDBOX_RENTAL_CONFIRM_MINUTES * 60_000) return { status: "requested", confirmation: null, counter: null };
    const city = getStayCity(q.city);
    const where = q.pickupSpot === "airport" ? `${city?.airportEn ?? q.city} — arrivals hall` : `${city?.en ?? q.city} — city branch`;
    return {
      status: "confirmed",
      confirmation: `CR${createHash("sha256").update(ref).digest("hex").slice(0, 6).toUpperCase()}`,
      counter: { name: SANDBOX_NAME.en, phone: "+966500000401", address: where },
    };
  },
  async cancel() {
    /* nothing to release in the simulation */
  },
};

const sandboxOn = () => mtConfig().mock && process.env.DEMO_RENTALS !== "off";

/** Companies renting in a city: the linked ones, else the sandbox one (sandbox mode). */
export function rentalProvidersFor(city: string): RentalProvider[] {
  const linked = readConfig().map(apiProvider).filter((p) => p.cities.includes(city));
  if (linked.length) return linked;
  return sandboxOn() && getStayCity(city) ? [sandboxProvider] : [];
}

export function rentalProviderById(id: string): RentalProvider | null {
  if (id === "sandbox") return sandboxProvider;
  const c = readConfig().find((p) => p.id === id);
  return c ? apiProvider(c) : null;
}
