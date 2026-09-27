/**
 * Intercity bus tickets bought in the platform: trips and seat maps from the operator, seats held
 * here while paying, named tickets issued by the operator (codes shown as QR), and cancellation
 * with the operator's refund. Passport numbers go to the operator only; orders keep them masked.
 */
import { randomBytes } from "node:crypto";
import type { PublicUser } from "../auth/types";
import { notifyTravellers } from "../notify";
import { chargeCard, refundPayment, type CardInput } from "../payment";
import { store } from "../store";
import { resolvePassenger, TrainOrderError, type PassengerInput } from "../trains/orders";
import { BusProviderError, busProviderById, busProviders } from "./provider";
import { MAX_BUS_PASSENGERS, type BusOrder, type BusSeatMap, type BusTrip } from "./types";

export class BusOrderError extends Error {
  constructor(public code: string, public status = 422) {
    super(code);
  }
}

type Stored = BusOrder & { userId: string };
interface TripSeats { id: string; taken: Record<string, string> }
const SALES_CLOSE_MIN = 30;
const mask = (p: string) => (p.length > 4 ? `${"•".repeat(p.length - 4)}${p.slice(-4)}` : p);
const strip = ({ userId: _u, ...o }: Stored): BusOrder => o; // eslint-disable-line @typescript-eslint/no-unused-vars

export async function searchBuses(from: string, to: string, day: string, now = new Date()): Promise<BusTrip[]> {
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new BusOrderError("invalidSearch", 400);
  const all = await Promise.all(busProviders().map((p) => p.search(from, to, day).catch(() => [] as BusTrip[])));
  return all.flat().filter((t) => Date.parse(t.depart) - now.getTime() > SALES_CLOSE_MIN * 60_000).sort((a, b) => a.depart.localeCompare(b.depart));
}

async function findTrip(providerId: string, q: { tripId: string; from: string; to: string; date: string }, now: Date): Promise<BusTrip> {
  const p = busProviderById(providerId);
  if (!p) throw new BusOrderError("noOperator", 404);
  // The trip is looked up again from the operator, never taken from the browser.
  const trips = /^[A-Z]{3}$/.test(q.from) && /^[A-Z]{3}$/.test(q.to) && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? await p.search(q.from, q.to, q.date).catch(() => []) : [];
  const trip = trips.find((t) => t.id === q.tripId);
  if (!trip) throw new BusOrderError("tripNotFound", 404);
  if (Date.parse(trip.depart) - now.getTime() <= SALES_CLOSE_MIN * 60_000) throw new BusOrderError("salesClosed", 409);
  return trip;
}

async function heldHere(tripId: string): Promise<Record<string, string>> {
  return (await store().get<TripSeats>("busSeats", tripId))?.taken ?? {};
}

export async function busSeatMap(providerId: string, tripId: string): Promise<BusSeatMap> {
  const p = busProviderById(providerId);
  if (!p) throw new BusOrderError("noOperator", 404);
  let map: BusSeatMap;
  try {
    map = await p.seats(tripId);
  } catch {
    throw new BusOrderError("operatorUnavailable", 502);
  }
  return { ...map, taken: [...new Set([...map.taken, ...Object.keys(await heldHere(tripId))])] };
}

async function hold(tripId: string, seats: string[], orderId: string, taken: string[]): Promise<boolean> {
  const s = store();
  if (!(await s.get("busSeats", tripId))) await s.insert<TripSeats>("busSeats", tripId, { id: tripId, taken: {} });
  let ok = true;
  await s.update<TripSeats>("busSeats", tripId, (doc) => {
    if (seats.some((x) => doc.taken[x] || taken.includes(x))) {
      ok = false;
      return doc;
    }
    const next = { ...doc.taken };
    for (const x of seats) next[x] = orderId;
    return { ...doc, taken: next };
  });
  return ok;
}

async function release(tripId: string, orderId: string) {
  await store().update<TripSeats>("busSeats", tripId, (doc) => ({ ...doc, taken: Object.fromEntries(Object.entries(doc.taken).filter(([, o]) => o !== orderId)) }));
}

export interface BusOrderInput { providerId?: string; tripId?: string; from?: string; to?: string; date?: string; seats?: string[]; passengers?: PassengerInput[]; expectedTotalSAR?: number; card?: CardInput }

export async function createBusOrder(user: PublicUser, input: BusOrderInput, now = new Date()): Promise<BusOrder> {
  const provider = busProviderById(String(input.providerId ?? ""));
  if (!provider) throw new BusOrderError("noOperator", 404);
  const trip = await findTrip(provider.id, { tripId: String(input.tripId ?? ""), from: String(input.from ?? ""), to: String(input.to ?? ""), date: String(input.date ?? "") }, now);
  const passengers = input.passengers ?? [];
  const seats = [...new Set((input.seats ?? []).map(String))];
  if (!passengers.length || passengers.length > MAX_BUS_PASSENGERS || seats.length !== passengers.length) throw new BusOrderError("invalidPassengers");
  if (!passengers.some((p) => p.type === "adult")) throw new BusOrderError("adultRequired");
  let resolved;
  try {
    resolved = await Promise.all(passengers.map((p) => resolvePassenger(user.id, p)));
  } catch (e) {
    throw new BusOrderError(e instanceof TrainOrderError ? e.code : "invalidPassenger");
  }
  const map = await busSeatMap(provider.id, trip.id);
  const valid = new Set(Array.from({ length: map.rows }, (_, r) => map.letters.map((l) => `${r + 1}${l}`)).flat());
  if (seats.some((s) => !valid.has(s))) throw new BusOrderError("invalidSeat");
  const prices = resolved.map((p) => (p.type === "child" ? trip.fare.child : trip.fare.adult));
  const total = prices.reduce((a, b) => a + b, 0);
  if (Math.abs(total - Number(input.expectedTotalSAR)) > 0.01) throw new BusOrderError("priceChanged", 409);
  const id = randomBytes(10).toString("hex");
  const operatorTaken = (await provider.seats(trip.id).catch(() => map)).taken;
  if (!(await hold(trip.id, seats, id, operatorTaken))) throw new BusOrderError("seatTaken", 409);
  if (!input.card) {
    await release(trip.id, id);
    throw new BusOrderError("invalid_card");
  }
  const paid = await chargeCard(input.card, total, now);
  if (!paid.ok) {
    await release(trip.id, id);
    throw new BusOrderError(paid.code, 402);
  }
  const reference = `BS-${randomBytes(3).toString("hex").toUpperCase()}`;
  let issued;
  try {
    issued = await provider.book({ tripId: trip.id, seats, passengers: resolved.map((p) => ({ nameEn: p.nameEn, nationality: p.nationality, passportNo: p.passportNo, type: p.type })), reference });
  } catch (e) {
    await release(trip.id, id);
    await refundPayment(paid.transactionId, total);
    throw new BusOrderError(e instanceof BusProviderError && e.code === "rejected" ? "operatorRejected" : "operatorUnavailable", 502);
  }
  const at = now.toISOString();
  const order: Stored = {
    id, reference, pnr: issued.pnr, userId: user.id, providerId: provider.id, providerNameAr: provider.nameAr, providerNameEn: provider.nameEn, trip,
    passengers: resolved.map((p) => ({ nameEn: p.nameEn, nationality: p.nationality, passportMasked: mask(p.passportNo), type: p.type })),
    tickets: seats.map((seat, i) => ({ seat, passenger: i, code: issued.codes[i], priceSAR: prices[i] })),
    totalSAR: total, status: "CONFIRMED", payment: { transactionId: paid.transactionId, method: paid.method, last4: paid.last4, amountSAR: total, paidAt: at },
    cancellation: null, createdAt: at, ...(provider.sandbox ? { sandbox: true } : {}),
  };
  await store().put("busOrders", id, order);
  await notifyTravellers([user.email], {
    subject: `Saudi Trip — bus ${trip.from} → ${trip.to} (${issued.pnr})`,
    text: [`${provider.nameEn} ${trip.tripNo}: ${trip.from} → ${trip.to}, ${trip.depart.slice(0, 16).replace("T", " ")} UTC — seats ${seats.join(", ")} (PNR ${issued.pnr}).`, "Show each ticket's QR code when boarding, with the passenger's passport.", "", `${provider.nameAr} ${trip.tripNo} — المقاعد ${seats.join("، ")} (PNR ${issued.pnr}). اعرض رمز QR لكل تذكرة عند الصعود مع جواز السفر.`].join("\n"),
  }).catch(() => undefined);
  return strip(order);
}

export async function listBusOrders(userId: string): Promise<BusOrder[]> {
  return (await store().findBy<Stored>("busOrders", "userId", userId)).map(strip).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getBusOrder(userId: string, id: string): Promise<BusOrder | null> {
  const o = await store().get<Stored>("busOrders", id);
  return o && o.userId === userId ? strip(o) : null;
}

/** Cancels with the operator; the operator's refund goes back to the card. */
export async function cancelBusOrder(userId: string, id: string, now = new Date()): Promise<BusOrder> {
  const o = await store().get<Stored>("busOrders", id);
  if (!o || o.userId !== userId) throw new BusOrderError("notFound", 404);
  if (o.status !== "CONFIRMED") throw new BusOrderError("alreadyCancelled", 409);
  if (Date.parse(o.trip.depart) <= now.getTime()) throw new BusOrderError("departed", 409);
  const p = busProviderById(o.providerId);
  if (!p) throw new BusOrderError("noOperator", 404);
  let r;
  try {
    r = await p.cancel(o.pnr, o.trip, o.totalSAR, now);
  } catch {
    throw new BusOrderError("operatorUnavailable", 502);
  }
  const refundSAR = Math.min(o.totalSAR, r.refundSAR);
  if (refundSAR > 0) await refundPayment(o.payment.transactionId, refundSAR);
  await release(o.trip.id, o.id);
  return strip((await store().update<Stored>("busOrders", id, (x) => ({ ...x, status: "CANCELLED", cancellation: { at: now.toISOString(), refundSAR } })))!);
}
