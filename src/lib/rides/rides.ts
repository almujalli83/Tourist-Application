/**
 * Ordering a car inside the platform: options and prices from the ride companies, the request
 * sent to the chosen one (re-quoted, never priced from the browser), then followed live — driver,
 * position, arrival time and final fare — until the trip ends. Paid to the company.
 */
import { randomBytes } from "node:crypto";
import type { PublicUser } from "../auth/types";
import { store } from "../store";
import { RideProviderError, rideProviderById, rideProviders } from "./providers";
import { LIVE_RIDE, RIDE_CATEGORIES, type PublicRide, type RideOption, type RidePoint } from "./types";

const COL = "rides" as const;
type Stored = PublicRide & { userId: string; phone: string; optionId: string; providerRef: string };

export class RideError extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}

const strip = ({ userId: _u, phone: _p, optionId: _o, providerRef: _r, ...x }: Stored): PublicRide => x; // eslint-disable-line @typescript-eslint/no-unused-vars

function point(p: Partial<RidePoint> | undefined): RidePoint {
  const lat = Number(p?.lat);
  const lng = Number(p?.lng);
  // Within the Kingdom.
  if (!(lat > 16 && lat < 33 && lng > 34 && lng < 56)) throw new RideError("invalidPlace");
  return { name: String(p?.name ?? "").trim().slice(0, 120) || `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng };
}

/** Every company's options for the trip, cheapest first within each category. */
export async function rideOptions(input: { pickup?: Partial<RidePoint>; dropoff?: Partial<RidePoint> }): Promise<RideOption[]> {
  const pickup = point(input.pickup);
  const dropoff = point(input.dropoff);
  const providers = rideProviders();
  if (!providers.length) throw new RideError("noProvider", 409);
  const all = await Promise.all(providers.map((p) => p.estimate(pickup, dropoff).catch(() => [] as RideOption[])));
  return all.flat().sort((a, b) => RIDE_CATEGORIES.indexOf(a.category) - RIDE_CATEGORIES.indexOf(b.category) || a.minSAR - b.minSAR);
}

export async function requestRide(user: PublicUser, input: { providerId?: string; optionId?: string; pickup?: Partial<RidePoint>; dropoff?: Partial<RidePoint>; phone?: string }, now = new Date()): Promise<PublicRide> {
  const pickup = point(input.pickup);
  const dropoff = point(input.dropoff);
  const mine = await store().findBy<Stored>(COL, "userId", user.id);
  if (mine.some((r) => LIVE_RIDE.includes(r.status))) throw new RideError("rideInProgress", 409);
  const provider = rideProviderById(String(input.providerId ?? ""));
  if (!provider) throw new RideError("noProvider", 409);
  let option: RideOption | undefined;
  try {
    option = (await provider.estimate(pickup, dropoff)).find((o) => o.optionId === input.optionId);
  } catch {
    throw new RideError("providerUnavailable", 502);
  }
  if (!option) throw new RideError("optionExpired", 409);
  const phone = String(input.phone ?? user.individual?.phone ?? user.company?.phone ?? "").replace(/[^\d+]/g, "");
  if (phone.length < 8) throw new RideError("invalidPhone");
  const reference = `RD-${randomBytes(3).toString("hex").toUpperCase()}`;
  let booked;
  try {
    booked = await provider.request({ optionId: option.optionId, pickup, dropoff, riderName: user.individual?.fullName ?? user.company?.contactPerson ?? "", phone, reference });
  } catch (e) {
    throw new RideError(e instanceof RideProviderError && e.code === "rejected" ? "providerRejected" : "providerUnavailable", 502);
  }
  const at = now.toISOString();
  const r: Stored = {
    id: randomBytes(10).toString("hex"), reference, userId: user.id, phone, optionId: option.optionId, providerRef: booked.ref,
    providerId: provider.id, providerNameAr: provider.nameAr, providerNameEn: provider.nameEn, color: provider.color, category: option.category, product: option.product,
    pickup, dropoff, minSAR: option.minSAR, maxSAR: option.maxSAR, fareSAR: null, status: booked.status, driver: null, driverAt: null, etaMins: option.etaMins,
    cancelReason: null, createdAt: at, updatedAt: at, ...(provider.sandbox ? { sandbox: true } : {}),
  };
  await store().put(COL, r.id, r);
  return strip(r);
}

async function refresh(r: Stored, now: Date): Promise<Stored> {
  if (!LIVE_RIDE.includes(r.status)) return r;
  // Nobody accepted within 10 minutes, or the ride was never closed.
  if (r.status === "searching" && now.getTime() - Date.parse(r.createdAt) > 10 * 60_000) {
    await rideProviderById(r.providerId)?.cancel(r.providerRef).catch(() => undefined);
    return (await store().update<Stored>(COL, r.id, (x) => ({ ...x, status: "no_driver", cancelReason: "no_driver", updatedAt: now.toISOString() })))!;
  }
  const p = rideProviderById(r.providerId);
  if (!p) return r;
  let s;
  try {
    s = await p.status(r.providerRef, r, now);
  } catch {
    return r;
  }
  return (await store().update<Stored>(COL, r.id, (x) => ({
    ...x, status: s.status, driver: s.driver ?? x.driver, driverAt: s.driverAt, etaMins: s.etaMins, fareSAR: s.fareSAR ?? x.fareSAR,
    cancelReason: s.status === "cancelled" && !x.cancelReason ? "provider" : s.status === "no_driver" ? "no_driver" : x.cancelReason, updatedAt: now.toISOString(),
  })))!;
}

export async function getRide(userId: string, id: string, now = new Date()): Promise<PublicRide | null> {
  const r = await store().get<Stored>(COL, id);
  if (!r || r.userId !== userId) return null;
  return strip(await refresh(r, now));
}

export async function listRides(userId: string, now = new Date()): Promise<PublicRide[]> {
  const out: PublicRide[] = [];
  for (const r of await store().findBy<Stored>(COL, "userId", userId)) out.push(strip(await refresh(r, now)));
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Cancels before the trip starts (the company's own cancellation fee may apply once a driver is on the way). */
export async function cancelRide(userId: string, id: string, now = new Date()): Promise<PublicRide> {
  const r = await store().get<Stored>(COL, id);
  if (!r || r.userId !== userId) throw new RideError("notFound", 404);
  const cur = await refresh(r, now);
  if (!["searching", "accepted", "arriving"].includes(cur.status)) throw new RideError("notCancellable", 409);
  try {
    await rideProviderById(r.providerId)?.cancel(r.providerRef);
  } catch (e) {
    if (!(e instanceof RideProviderError && e.code === "rejected")) throw new RideError("providerUnavailable", 502);
  }
  return strip((await store().update<Stored>(COL, id, (x) => ({ ...x, status: "cancelled", cancelReason: "traveller", updatedAt: now.toISOString() })))!);
}
