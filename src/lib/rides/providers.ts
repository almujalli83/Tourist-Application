/**
 * Ride-hailing companies (Uber, Careem, Jeeny…), connected by API: price options for a trip,
 * requesting the ride, following it (driver, live position, arrival time, final fare) and
 * cancelling. The fare is paid to the company (cash or the card on the traveller's account).
 *
 * Linked companies are configured in RIDE_PROVIDERS (JSON array):
 *   [{ "id": "uber", "nameAr": "أوبر", "nameEn": "Uber", "color": "#000000", "url": "https://…/v1", "token": "…" }]
 * Expected endpoints (to be matched with each company's specification):
 *   POST   {url}/estimates   { pickup:{lat,lng,name}, dropoff } → [{ optionId, category, product, seats, minSAR, maxSAR, etaMins, tripMins }]
 *   POST   {url}/rides       { optionId, pickup, dropoff, riderName, phone, reference } → { ref, status }
 *   GET    {url}/rides/{ref} → { status, driver?, driverAt?, etaMins?, fareSAR? }
 *   DELETE {url}/rides/{ref}
 * Sandbox (no MT credentials): Uber, Careem and Jeeny are simulated with sample prices; a driver
 * accepts after ~20 s, drives to the pickup, then to the destination. Off with DEMO_RIDES=off.
 */
import { createHash, randomBytes } from "node:crypto";
import { mtConfig } from "../config";
import { distanceKm } from "../guide/geo";
import { estimateFromKm } from "../transport/rides";
import { RIDE_CATEGORIES, type RideCategory, type RideDriver, type RideOption, type RidePoint, type RideStatus } from "./types";

export class RideProviderError extends Error {
  constructor(public code: "unavailable" | "rejected") {
    super(code);
  }
}

export interface RideState { status: RideStatus; driver: RideDriver | null; driverAt: { lat: number; lng: number } | null; etaMins: number | null; fareSAR: number | null }

export interface RideProvider {
  id: string;
  nameAr: string;
  nameEn: string;
  color: string;
  sandbox: boolean;
  estimate(pickup: RidePoint, dropoff: RidePoint): Promise<RideOption[]>;
  request(r: { optionId: string; pickup: RidePoint; dropoff: RidePoint; riderName: string; phone: string; reference: string }): Promise<{ ref: string; status: RideStatus }>;
  status(ref: string, ride: { createdAt: string; pickup: RidePoint; dropoff: RidePoint; optionId: string }, now: Date): Promise<RideState>;
  cancel(ref: string): Promise<void>;
}

const STATUSES: RideStatus[] = ["searching", "accepted", "arriving", "in_progress", "completed", "cancelled", "no_driver"];

/* ------------------------------------------------------------------ API */

interface ProviderConfig { id: string; nameAr?: string; nameEn?: string; color?: string; url: string; token?: string }

function readConfig(): ProviderConfig[] {
  try {
    const list = JSON.parse(process.env.RIDE_PROVIDERS ?? "[]") as ProviderConfig[];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.id === "string" && typeof p.url === "string") : [];
  } catch {
    return [];
  }
}

function apiProvider(c: ProviderConfig): RideProvider {
  const base = c.url.replace(/\/$/, "");
  const nameAr = c.nameAr || c.nameEn || c.id;
  const nameEn = c.nameEn || c.id;
  const color = /^#[0-9a-f]{6}$/i.test(String(c.color)) ? String(c.color) : "#111827";
  const call = async (path: string, init: RequestInit = {}) => {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        ...init,
        headers: { accept: "application/json", "content-type": "application/json", ...(c.token ? { authorization: `Bearer ${c.token}` } : {}) },
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw new RideProviderError("unavailable");
    }
    if (res.status >= 400 && res.status < 500) throw new RideProviderError("rejected");
    if (!res.ok) throw new RideProviderError("unavailable");
    return res.status === 204 ? null : ((await res.json().catch(() => null)) as unknown);
  };
  const num = (v: unknown) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
  return {
    id: c.id, nameAr, nameEn, color, sandbox: false,
    async estimate(pickup, dropoff) {
      const body = await call("/estimates", { method: "POST", body: JSON.stringify({ pickup, dropoff }) });
      return ((Array.isArray(body) ? body : ((body as { data?: unknown[] })?.data ?? [])) as Record<string, unknown>[])
        .filter((r) => typeof r.optionId === "string" && (RIDE_CATEGORIES as readonly string[]).includes(String(r.category)) && Number(r.minSAR) > 0)
        .map((r) => ({
          optionId: r.optionId as string, providerId: c.id, providerNameAr: nameAr, providerNameEn: nameEn, color,
          category: r.category as RideCategory, product: String(r.product ?? r.category), seats: Number(r.seats ?? 4),
          minSAR: Number(r.minSAR), maxSAR: Math.max(Number(r.minSAR), Number(r.maxSAR ?? r.minSAR)), etaMins: Number(r.etaMins ?? 5), tripMins: Number(r.tripMins ?? 0),
        }));
    },
    async request(r) {
      const b = (await call("/rides", { method: "POST", body: JSON.stringify(r) })) as { ref?: unknown; status?: unknown } | null;
      if (typeof b?.ref !== "string") throw new RideProviderError("rejected");
      return { ref: b.ref, status: STATUSES.includes(b.status as RideStatus) ? (b.status as RideStatus) : "searching" };
    },
    async status(ref) {
      const b = (await call(`/rides/${encodeURIComponent(ref)}`)) as Record<string, unknown> | null;
      if (!b || !STATUSES.includes(b.status as RideStatus)) throw new RideProviderError("unavailable");
      const d = b.driver as Partial<RideDriver> | undefined;
      const at = b.driverAt as { lat?: unknown; lng?: unknown } | undefined;
      return {
        status: b.status as RideStatus,
        driver: d && typeof d.name === "string" ? { name: d.name, phone: String(d.phone ?? ""), car: String(d.car ?? ""), plate: String(d.plate ?? ""), rating: num(d.rating) } : null,
        driverAt: at && num(at.lat) !== null && num(at.lng) !== null ? { lat: Number(at.lat), lng: Number(at.lng) } : null,
        etaMins: num(b.etaMins), fareSAR: num(b.fareSAR),
      };
    },
    async cancel(ref) {
      await call(`/rides/${encodeURIComponent(ref)}`, { method: "DELETE" });
    },
  };
}

/* -------------------------------------------------------------- sandbox */

const SANDBOX: { id: string; nameAr: string; nameEn: string; color: string; factor: number; products: Partial<Record<RideCategory, string>> }[] = [
  { id: "uber", nameAr: "أوبر", nameEn: "Uber", color: "#000000", factor: 1, products: { economy: "UberX", comfort: "Comfort", family: "UberXL", premium: "Black" } },
  { id: "careem", nameAr: "كريم", nameEn: "Careem", color: "#1AB65C", factor: 0.95, products: { economy: "Go", comfort: "Go+", family: "Max", premium: "Business" } },
  { id: "jeeny", nameAr: "جيني", nameEn: "Jeeny", color: "#6C2BD9", factor: 0.9, products: { economy: "Jeeny", comfort: "Comfort", family: "Family" } },
];
const CAT: Record<RideCategory, { mult: number; seats: number }> = { economy: { mult: 1, seats: 4 }, comfort: { mult: 1.3, seats: 4 }, family: { mult: 1.6, seats: 6 }, premium: { mult: 2.3, seats: 4 } };
/** Simulated timeline (seconds): a driver accepts, reaches the pickup, then the destination. */
export const SANDBOX_ACCEPT_S = 20;
const DRIVERS: RideDriver[] = [
  { name: "Abdullah", phone: "+966500000501", car: "Toyota Camry — white", plate: "ب ح د 4821", rating: 4.9 },
  { name: "Khalid", phone: "+966500000502", car: "Hyundai Sonata — silver", plate: "ر ع ن 3310", rating: 4.8 },
  { name: "Fahad", phone: "+966500000503", car: "GMC Yukon — black", plate: "س ل ك 7755", rating: 4.95 },
];
const lerp = (a: { lat: number; lng: number }, b: { lat: number; lng: number }, f: number) => ({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f });

function sandboxProvider(s: (typeof SANDBOX)[number]): RideProvider {
  const eta = (p: RidePoint) => 3 + (createHash("sha256").update(`${s.id}${p.lat.toFixed(3)}${p.lng.toFixed(3)}`).digest()[0] % 6);
  return {
    id: s.id, nameAr: s.nameAr, nameEn: s.nameEn, color: s.color, sandbox: true,
    async estimate(pickup, dropoff) {
      const e = estimateFromKm(distanceKm(pickup, dropoff));
      return (Object.keys(s.products) as RideCategory[]).map((cat) => ({
        optionId: `sbx-${s.id}-${cat}`, providerId: s.id, providerNameAr: s.nameAr, providerNameEn: s.nameEn, color: s.color, category: cat, product: s.products[cat]!,
        seats: CAT[cat].seats, minSAR: Math.round(e.minSAR * s.factor * CAT[cat].mult), maxSAR: Math.round(e.maxSAR * s.factor * CAT[cat].mult),
        etaMins: eta(pickup) + (cat === "premium" ? 3 : 0), tripMins: e.mins, sandbox: true,
      }));
    },
    async request() {
      return { ref: `SBX-RD-${randomBytes(3).toString("hex").toUpperCase()}`, status: "searching" };
    },
    async status(ref, ride, now) {
      const t = (now.getTime() - Date.parse(ride.createdAt)) / 1000;
      if (t < SANDBOX_ACCEPT_S) return { status: "searching", driver: null, driverAt: null, etaMins: null, fareSAR: null };
      const driver = DRIVERS[createHash("sha256").update(ref).digest()[0] % DRIVERS.length];
      const approach = eta(ride.pickup) * 60;
      const trip = estimateFromKm(distanceKm(ride.pickup, ride.dropoff));
      const start = { lat: ride.pickup.lat + 0.012, lng: ride.pickup.lng - 0.01 };
      const since = t - SANDBOX_ACCEPT_S;
      if (since < approach) {
        const f = since / approach;
        return { status: f < 0.15 ? "accepted" : "arriving", driver, driverAt: lerp(start, ride.pickup, f), etaMins: Math.max(1, Math.ceil((approach - since) / 60)), fareSAR: null };
      }
      const riding = since - approach - 60; // a minute to get in
      if (riding < 0) return { status: "arriving", driver, driverAt: ride.pickup, etaMins: 0, fareSAR: null };
      if (riding < trip.mins * 60) return { status: "in_progress", driver, driverAt: lerp(ride.pickup, ride.dropoff, riding / (trip.mins * 60)), etaMins: Math.max(1, Math.ceil((trip.mins * 60 - riding) / 60)), fareSAR: null };
      const cat = (ride.optionId.split("-")[2] ?? "economy") as RideCategory;
      return { status: "completed", driver, driverAt: ride.dropoff, etaMins: 0, fareSAR: Math.round(((trip.minSAR + trip.maxSAR) / 2) * s.factor * (CAT[cat]?.mult ?? 1)) };
    },
    async cancel() {
      /* nothing to release in the simulation */
    },
  };
}

const sandboxOn = () => mtConfig().mock && process.env.DEMO_RIDES !== "off";

/** The companies: linked by API, else simulated in the sandbox. */
export function rideProviders(): RideProvider[] {
  const linked = readConfig().map(apiProvider);
  if (linked.length) return linked;
  return sandboxOn() ? SANDBOX.map(sandboxProvider) : [];
}

export function rideProviderById(id: string): RideProvider | null {
  const c = readConfig().find((p) => p.id === id);
  if (c) return apiProvider(c);
  const s = SANDBOX.find((p) => p.id === id);
  return s && sandboxOn() ? sandboxProvider(s) : null;
}
