/**
 * "Complete your trip" (client-safe): from a flight or hotel booking without a package, the city,
 * dates and flights of the stay, turned into links that open each service already filled in.
 * Nothing is booked from here — every link lands on the service's own page for the traveller to confirm.
 */
import { getStayCity } from "../data/cities";
import { addDaysISO } from "../events/format";
import { AIRPORTS } from "../transport/rides";
import type { EntryType } from "./entry";
import type { FlightOrder, StayOrder } from "./types";

/** A flight end at a Saudi airport that airport transfers serve. */
export interface AirportLeg {
  direction: "arrival" | "departure";
  airport: string;
  flightNo: string;
  /** Saudi local "YYYY-MM-DDTHH:MM". */
  at: string;
}

/** Where and when the traveller stays in the Kingdom. */
export interface TripWindow {
  city: string;
  /** Check-in / check-out days. */
  from: string;
  to: string;
  entry: EntryType;
  /** Arriving from abroad (an eSIM helps). */
  international: boolean;
  pax: number;
  arrival?: AirportLeg;
  departure?: AirportLeg;
}

/** Nights assumed after a one-way arrival, until the traveller books the return. */
export const ONE_WAY_NIGHTS = 3;

const served = (code: string) => code in AIRPORTS && !!getStayCity(code);
const minutes = (at: string, delta: number) => {
  const d = new Date(Date.parse(`${at}:00Z`) + delta * 60_000);
  return d.toISOString().slice(0, 16);
};

/** Every Saudi airport end of the flights: a car from the airport on landing, one to it before take-off. */
export function flightAirportLegs(o: FlightOrder): AirportLeg[] {
  const legs: AirportLeg[] = [];
  for (const { offer } of o.segments) {
    if (served(offer.from)) legs.push({ direction: "departure", airport: offer.from, flightNo: offer.flightNo, at: offer.departAt });
    if (served(offer.to)) legs.push({ direction: "arrival", airport: offer.to, flightNo: offer.flightNo, at: offer.arriveAt });
  }
  return legs.sort((a, b) => a.at.localeCompare(b.at));
}

/** The stay the flights imply: the Saudi city flown to (the transit city for a stopover). */
export function flightWindow(o: FlightOrder): TripWindow | null {
  const [out, next] = o.segments.map((s) => s.offer);
  if (!out || !served(out.to)) return null;
  const arrival: AirportLeg = { direction: "arrival", airport: out.to, flightNo: out.flightNo, at: out.arriveAt };
  const from = out.arriveAt.slice(0, 10);
  const leaving = next && next.from === out.to ? next : undefined;
  const to = leaving ? leaving.departAt.slice(0, 10) : addDaysISO(from, ONE_WAY_NIGHTS);
  return {
    city: out.to, from, to: to > from ? to : addDaysISO(from, 1), entry: o.entry,
    international: !getStayCity(out.from),
    pax: o.passengers.length,
    arrival,
    ...(leaving ? { departure: { direction: "departure", airport: leaving.from, flightNo: leaving.flightNo, at: leaving.departAt } } : {}),
  };
}

/** The stay of a hotel booking; the flights, when the traveller booked them here too. */
export function stayWindow(s: StayOrder, flights: FlightOrder[] = []): TripWindow {
  const h = s.hotel;
  const w: TripWindow = {
    city: h.city, from: h.checkIn, to: h.checkOut, entry: s.entry, international: s.entry !== "citizen" && s.entry !== "resident",
    pax: s.rooms.reduce((a, r) => a + r.adults + r.childAges.length, 0),
  };
  const f = matchingFlight(w, flights);
  const fw = f && flightWindow(f);
  if (fw) {
    w.international = fw.international;
    if (fw.arrival) w.arrival = fw.arrival;
    if (fw.departure) w.departure = fw.departure;
  }
  // A package-free return flight home from the hotel's city.
  if (!w.departure) {
    const back = flights.filter((o) => o.status === "confirmed").flatMap((o) => o.segments.map((sg) => sg.offer)).find((x) => x.from === w.city && x.departAt.slice(0, 10) === w.to);
    if (back && served(back.from)) w.departure = { direction: "departure", airport: back.from, flightNo: back.flightNo, at: back.departAt };
  }
  return w;
}

/** A live flight booking that lands in the window's city on its first day (or the day before, late at night). */
export function matchingFlight(w: Pick<TripWindow, "city" | "from">, flights: FlightOrder[]): FlightOrder | undefined {
  return flights.find((o) => o.status === "confirmed" && o.segments.some((s) => s.offer.to === w.city && (s.offer.arriveAt.slice(0, 10) === w.from || s.offer.arriveAt.slice(0, 10) === addDaysISO(w.from, -1))));
}

/** A live hotel booking in the window's city whose dates overlap it. */
export function matchingStay(w: Pick<TripWindow, "city" | "from" | "to">, stays: StayOrder[]): StayOrder | undefined {
  return stays.find((s) => s.status === "confirmed" && s.hotel.city === w.city && s.hotel.checkIn < w.to && s.hotel.checkOut > w.from);
}

export type StepKey = "hotel" | "flight" | "onward" | "transfer" | "rental" | "esim" | "events" | "restaurants" | "guides" | "prayer";

export interface Step {
  key: StepKey;
  href: string;
  /** For transfers: which flight end. */
  leg?: AirportLeg;
  /** For onward travel: the next city and the day. */
  onward?: { to: string; date: string };
}

/** Moving on to the next city of a multi-city trip: a flight between airports, else the intercity trains and buses. */
export function onwardHref(from: string, to: string, date: string): string {
  const air = (c: string) => c !== "MKX" && c in AIRPORTS;
  return air(from) && air(to) ? `/flights?${qs({ from, to, date, trip: "oneway" })}` : `/transport?${qs({ city: from === "MKX" ? to : from })}`;
}

const qs = (p: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString();

/** Link to the transport page's transfer form, filled with the flight (and the hotel, when known). */
export function transferHref(leg: AirportLeg, pax: number, place?: string): string {
  return `/transport?${qs({ transfer: leg.direction, airport: leg.airport, flight: leg.flightNo, at: leg.at, pax: Math.max(1, Math.min(8, pax)), place })}#transfer`;
}

/**
 * The links for a window, in the order a traveller needs them. `have` holds what is already
 * booked here (then the hotel / flight link is left out and the page shows the booking instead).
 */
export function nextSteps(
  w: TripWindow,
  have: { stay?: boolean; flight?: boolean; hotelName?: string; backDate?: string; onward?: { to: string; date: string } } = {},
  legs?: AirportLeg[],
): Step[] {
  const steps: Step[] = [];
  if (!have.stay) steps.push({ key: "hotel", href: `/hotels?${qs({ entry: w.entry, city: w.city, checkIn: w.from, checkOut: w.to })}` });
  // Makkah has no airport: fly to Jeddah. A multi-city trip flies home from its last city (`backDate`).
  if (!have.flight) steps.push({ key: "flight", href: `/flights?${qs({ entry: w.entry, to: w.city === "MKX" ? "JED" : w.city, date: w.from, back: have.backDate ?? w.to, trip: "return" })}` });
  if (have.onward) steps.push({ key: "onward", onward: have.onward, href: onwardHref(w.city, have.onward.to, have.onward.date) });
  const ends = legs ?? [w.arrival, w.departure].filter((l): l is AirportLeg => !!l);
  for (const leg of ends) steps.push({ key: "transfer", leg, href: transferHref(leg, w.pax, leg.airport === w.city ? have.hotelName : undefined) });
  if (!ends.length && w.city in AIRPORTS) {
    steps.push({ key: "transfer", href: `/transport?${qs({ transfer: "arrival", airport: w.city, at: `${w.from}T12:00`, pax: w.pax, place: have.hotelName })}#transfer` });
  }
  const pickupAt = w.arrival ? minutes(w.arrival.at, 60) : `${w.from}T14:00`;
  const returnAt = w.departure ? minutes(w.departure.at, -180) : `${w.to}T10:00`;
  if (returnAt > pickupAt && w.city !== "MKX") steps.push({ key: "rental", href: `/transport?${qs({ city: w.city, pickupAt, returnAt })}#rental` });
  if (w.international) steps.push({ key: "esim", href: "/esim" });
  steps.push(
    { key: "events", href: `/events?${qs({ city: w.city, from: w.from, to: w.to })}` },
    { key: "restaurants", href: `/restaurants?${qs({ city: w.city })}` },
    { key: "guides", href: `/guides?${qs({ city: w.city })}` },
    { key: "prayer", href: "/prayer" },
  );
  return steps;
}
