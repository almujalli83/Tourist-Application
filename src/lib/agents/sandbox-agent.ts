import { randomBytes } from "node:crypto";
import { addDays } from "../dates";
import type { CabinClass } from "../types";
import {
  ACTIVITIES, AMENITIES, CARRIERS, DISTRICTS, DOMESTIC_CARRIERS, HOTEL_BRANDS, MAKKAH_DISTRICTS, ORIGIN_BLOCK_MIN,
  ORIGIN_HOME_CARRIER, ROOM_TYPES, sandboxHotelLicense,
} from "./mock-data";
import { AgentBookingError, type TravelAgentProvider } from "./provider";
import { rng } from "./rng";
import { CITY_CENTERS } from "../guide/centers";

/** IATA ticket prefixes (the first 3 digits of an e-ticket number). */
const AIRLINE_PREFIX: Record<string, string> = { SV: "065", XY: "593", F3: "706", RX: "224", MS: "077", EK: "176", RJ: "512", ME: "076", AT: "147", TK: "235", PK: "214", AI: "098", GA: "126" };
const randomDigits = (n: number) => Array.from(randomBytes(n), (b) => String(b % 10)).join("");
const randomLetters = (n: number) => Array.from(randomBytes(n), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ"[b % 24]).join("");

const CABIN_FACTOR: Record<CabinClass, number> = { economy: 1, premium: 1.6, business: 2.8, first: 4.5 };

function hhmm(mins: number) {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Sandbox travel agent: produces realistic, deterministic inventory so the full
 * customer journey can be exercised before live agent contracts are connected.
 */
export function createSandboxAgent(opts: {
  id: string;
  nameEn: string;
  nameAr: string;
  priceFactor: number;
  latencyMs: number;
}): TravelAgentProvider {
  const wait = () => new Promise((r) => setTimeout(r, opts.latencyMs));

  return {
    id: opts.id,
    nameEn: opts.nameEn,
    nameAr: opts.nameAr,
    sandbox: true,

    async searchFlights({ leg, cabin }) {
      await wait();
      // Test hook: SANDBOX_NO_FLIGHT_DATES=YYYY-MM-DD,… makes the sandbox agents return no flights on those dates.
      if ((process.env.SANDBOX_NO_FLIGHT_DATES ?? "").split(",").map((d) => d.trim()).includes(leg.date)) return [];
      const r = rng(`${opts.id}|F|${leg.from}|${leg.to}|${leg.date}|${cabin}`);
      const domestic = leg.kind === "domestic";
      const count = r.int(2, 4);
      const baseBlock = domestic ? r.int(65, 110) : ORIGIN_BLOCK_MIN[leg.from] ?? ORIGIN_BLOCK_MIN[leg.to] ?? 240;
      const offers = [];
      for (let i = 0; i < count; i++) {
        const intlCity = leg.kind === "outbound" ? leg.from : leg.to;
        const carrierCode = domestic
          ? r.pick(DOMESTIC_CARRIERS)
          : r.next() < 0.45 ? r.pick(["SV", "XY", "F3", "RX"]) : ORIGIN_HOME_CARRIER[intlCity] ?? "SV";
        const carrier = CARRIERS.find((c) => c.code === carrierCode)!;
        const stops = domestic ? 0 : r.next() < 0.7 ? 0 : 1;
        const duration = baseBlock + stops * r.int(90, 180);
        const depMin = r.int(5, 22) * 60 + r.pick([0, 15, 30, 45]);
        const arrMinAbs = depMin + duration;
        const arriveDate = addDays(leg.date, Math.floor(arrMinAbs / 1440));
        const base = domestic ? r.int(260, 520) : r.int(900, 2600) * (baseBlock / 240);
        const adult = Math.round(base * CABIN_FACTOR[cabin] * opts.priceFactor);
        offers.push({
          ref: `${leg.index}-${i}`,
          legIndex: leg.index,
          kind: leg.kind,
          from: leg.from,
          to: leg.to,
          departAt: `${leg.date}T${hhmm(depMin)}`,
          arriveAt: `${arriveDate}T${hhmm(arrMinAbs)}`,
          durationMin: duration,
          stops,
          carrierCode,
          carrierNameEn: carrier.en,
          carrierNameAr: carrier.ar,
          flightNo: `${carrierCode}${r.int(100, 1999)}`,
          cabin,
          baggageKg: cabin === "economy" ? r.pick([23, 30]) : 40,
          refundable: r.next() < 0.4,
          fare: { adult, child: Math.round(adult * 0.75), infant: Math.round(adult * 0.1) },
        });
      }
      return offers;
    },

    async searchHotels({ city, checkIn, checkOut, rooms: occupancy, standalone }) {
      await wait();
      const r = rng(`${opts.id}|H|${city}|${checkIn}|${checkOut}`);
      const nights = Math.max(1, Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000));
      const rooms = occupancy.length;
      const count = r.int(3, 4);
      const used = new Set<number>();
      const offers = [];
      for (let i = 0; i < count; i++) {
        let bi = r.int(0, HOTEL_BRANDS.length - 1);
        while (used.has(bi)) bi = (bi + 1) % HOTEL_BRANDS.length;
        used.add(bi);
        const brand = HOTEL_BRANDS[bi];
        const district = r.pick(city === "MKX" ? MAKKAH_DISTRICTS : DISTRICTS);
        const room = r.pick(ROOM_TYPES);
        // A stable location per hotel and city: near the Haram in Makkah, within ~4 km of the centre elsewhere.
        const spot = rng(`hotel-spot|${city}|${bi}`);
        const c = CITY_CENTERS[city] ?? CITY_CENTERS.RUH;
        const spread = city === "MKX" ? 0.008 : 0.035;
        const perNight = Math.round((brand.stars * 180 + r.int(40, 380)) * opts.priceFactor) * rooms;
        offers.push({
          ref: `${city}-${i}`,
          city,
          nameEn: brand.en,
          nameAr: brand.ar,
          stars: brand.stars,
          // A hotel has one MT licence whichever agent sells it (the draw keeps the sequence stable).
          licenseNo: (r.int(0, 8_999_999), sandboxHotelLicense(city, bi)),
          districtEn: district.en,
          districtAr: district.ar,
          lat: Math.round((c.lat + (spot.next() - 0.5) * 2 * spread) * 1e5) / 1e5,
          lng: Math.round((c.lng + (spot.next() - 0.5) * 2 * spread) * 1e5) / 1e5,
          reviewScore: Math.round((7 + r.next() * 2.8) * 10) / 10,
          roomTypeEn: room.en,
          roomTypeAr: room.ar,
          rooms,
          board: r.pick(["RO", "BB", "BB", "HB"] as const),
          amenities: AMENITIES.filter(() => r.next() < 0.55),
          refundable: r.next() < 0.5,
          checkIn,
          checkOut,
          nights,
          pricePerNightSAR: perNight,
          totalSAR: perNight * nights,
        });
      }
      if (!standalone) return offers;
      // Standalone bookings: prepaid rates can be cancelled free until two days before arrival when
      // refundable; many hotels also take a (slightly dearer) rate paid at the hotel, free to cancel
      // until 18:00 the day before. A separate draw keeps the package inventory unchanged.
      const pr = rng(`${opts.id}|HR|${city}|${checkIn}|${checkOut}`);
      const out: ((typeof offers)[number] & { rate: { pay: "online" | "hotel"; freeCancelUntil: string | null } })[] = [];
      for (const o of offers) {
        out.push({ ...o, rate: { pay: "online" as const, freeCancelUntil: o.refundable ? `${addDays(checkIn, -2)}T23:59:00+03:00` : null } });
        if (pr.next() < 0.6) {
          const perNight = Math.round(o.pricePerNightSAR * 1.07);
          out.push({ ...o, ref: `${o.ref}-pah`, refundable: true, pricePerNightSAR: perNight, totalSAR: perNight * o.nights, rate: { pay: "hotel" as const, freeCancelUntil: `${addDays(checkIn, -1)}T18:00:00+03:00` } });
        }
      }
      return out;
    },

    async searchActivities({ city, from, pax }) {
      await wait();
      // Makkah: the stay is for Umrah; no leisure tickets are sold there.
      if (city === "MKX") return [];
      const r = rng(`${opts.id}|A|${city}|${from}`);
      // One ticket per traveller in the package.
      const party = pax.adults + pax.children + pax.infants;
      const picks = ACTIVITIES.filter(() => r.next() < 0.45).slice(0, 3);
      return picks.map((a, i) => {
        const price = Math.round(a.price * opts.priceFactor);
        const vat = Math.round(price * 0.15 * 100) / 100;
        const service = a.kind === "tour" ? 0 : 10;
        return {
          ref: `${city}-${i}`,
          kind: a.kind,
          city,
          titleEn: a.en,
          titleAr: a.ar,
          venueEn: a.venueEn,
          venueAr: a.venueAr,
          date: addDays(from, Math.min(i + 1, 2)),
          timeFrom: a.from,
          timeTo: a.to,
          pricePerPersonSAR: price,
          vatSAR: vat,
          serviceChargeSAR: service,
          partySize: party,
          totalSAR: Math.round((price + vat + service) * party * 100) / 100,
          // Event tickets are final; tours and restaurant bookings can be refunded.
          refundable: a.kind !== "event",
        };
      });
    },

    async quoteStayExtension({ hotel }) {
      await wait();
      // Sandbox policy: extra nights at the booked nightly rate.
      return hotel.agentId === opts.id ? { pricePerNightSAR: hotel.pricePerNightSAR } : null;
    },

    flightChangeFeeSAR(offer) {
      // Sandbox policy: flexible (refundable) tickets change for free, others pay a fee per ticket.
      return offer.refundable ? 0 : 150;
    },

    async requestChange({ items }) {
      await wait();
      // Sandbox: approves every change (a real agent may reject, e.g. no availability).
      return items.length
        ? { approved: true as const, reference: `${opts.id.toUpperCase()}-CHG-${Math.random().toString(36).slice(2, 10).toUpperCase()}` }
        : { approved: false as const, reason: "empty" };
    },
    async confirmChange() {
      await wait();
    },
    async releaseChange() {
      await wait();
    },

    async quoteHotelDates({ hotel, checkIn, checkOut }) {
      await wait();
      if (hotel.agentId !== opts.id || !hotel.rate) return null;
      // Sandbox: the nightly price moves by up to ±8% with the dates; the same cancellation rule applies.
      const r = rng(`${opts.id}|HQ|${hotel.licenseNo}|${checkIn}|${checkOut}`);
      const pricePerNightSAR = Math.round(hotel.pricePerNightSAR * (0.92 + r.next() * 0.16));
      const freeCancelUntil = hotel.rate.pay === "hotel" ? `${addDays(checkIn, -1)}T18:00:00+03:00` : hotel.refundable ? `${addDays(checkIn, -2)}T23:59:00+03:00` : null;
      return { pricePerNightSAR, freeCancelUntil };
    },

    // Test hook: a lead guest or passenger named "SANDBOX REJECT" is refused by the agent.
    async bookHotel({ lead }) {
      await wait();
      if (lead.name.toUpperCase() === "SANDBOX REJECT") throw new AgentBookingError("rejected");
      return { confirmation: `${opts.id.slice(0, 3).toUpperCase()}${randomDigits(8)}` };
    },
    async cancelHotel() {
      await wait();
    },
    async issueFlight({ offer, passengers }) {
      await wait();
      if (passengers.some((p) => p.nameEn.toUpperCase() === "SANDBOX REJECT")) throw new AgentBookingError("rejected");
      const airline = AIRLINE_PREFIX[offer.carrierCode] ?? "999";
      return { pnr: randomLetters(6), tickets: passengers.map(() => `${airline}${randomDigits(10)}`) };
    },
    async cancelFlight() {
      await wait();
    },
  };
}
