import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }), headers: async () => new Headers() }));

import { randomUUID } from "node:crypto";
import { searchHotels } from "@/lib/agents/aggregator";
import type { PublicUser } from "@/lib/auth/types";
import { addDays } from "@/lib/dates";
import { getAccount, ksaDate } from "@/lib/loyalty/loyalty";
import { stopoverProblem, validDocNo } from "@/lib/standalone/entry";
import { bookFlights, cancelFlightOrder, checkItinerary, flightCancelTerms, flightReminders, legKind, paxTypeOk, searchStandaloneFlights } from "@/lib/standalone/flights";
import { bookStay, cancelStay, changeStayDates, quoteStayChange, searchStays, stayCancelTerms, stayReminders, validateStayQuery } from "@/lib/standalone/stays";
import type { StayOrder } from "@/lib/standalone/types";
import { store } from "@/lib/store";
import type { FlightOffer, HotelOffer } from "@/lib/types";

const card = { holder: "TEST USER", number: "4111111111111111", expMonth: "12", expYear: "35", cvc: "123" };
const user = (): PublicUser => ({ id: randomUUID(), email: `s-${randomUUID()}@example.com`, accountType: "individual", preferredLocale: "en", preferredCurrency: "SAR", createdAt: new Date().toISOString() }) as PublicUser;
const today = () => ksaDate(new Date());
const lead = { name: "Sara Ahmed", email: "sara@example.com", phone: "+966501234567" };
const rooms = [{ adults: 2, childAges: [] }];

async function stayOffer(pred: (o: HotelOffer) => boolean, days = 20) {
  const checkIn = addDays(today(), days);
  const checkOut = addDays(checkIn, 3);
  const res = await searchStays({ city: "RUH", checkIn, checkOut, rooms });
  const offer = res.offers.find(pred);
  expect(offer, "a matching rate").toBeTruthy();
  return { offer: offer!, checkIn, checkOut };
}

describe("standalone hotels", () => {
  it("searches licensed 3–5★ hotels with online and pay-at-hotel rates", async () => {
    const { offer } = await stayOffer(() => true);
    const res = await searchStays({ city: "RUH", checkIn: offer.checkIn, checkOut: offer.checkOut, rooms });
    expect(res.offers.every((o) => o.stars >= 3 && o.stars <= 5 && o.licenseNo && o.rate)).toBe(true);
    expect(res.offers.some((o) => o.rate!.pay === "hotel")).toBe(true);
    expect(res.offers.some((o) => o.rate!.pay === "online")).toBe(true);
  });

  it("keeps package searches unchanged (prepaid only, no rate)", async () => {
    const checkIn = addDays(today(), 25);
    const pkg = await searchHotels({ city: "RUH", checkIn, checkOut: addDays(checkIn, 2), rooms, pax: { adults: 2, children: 0, infants: 0 } });
    expect(pkg.offers.length).toBeGreaterThan(0);
    expect(pkg.offers.every((o) => !o.rate && !o.id.endsWith("-pah"))).toBe(true);
  });

  it("validates the query", () => {
    const t = today();
    expect(() => validateStayQuery({ city: "XXX", checkIn: addDays(t, 2), checkOut: addDays(t, 3), rooms })).toThrow("city");
    expect(() => validateStayQuery({ city: "MKX", checkIn: addDays(t, 2), checkOut: addDays(t, 3), rooms })).toThrow("makkahMuslimsOnly");
    expect(validateStayQuery({ city: "MKX", checkIn: addDays(t, 2), checkOut: addDays(t, 3), rooms, umrah: true }).city).toBe("MKX");
    expect(() => validateStayQuery({ city: "RUH", checkIn: addDays(t, -1), checkOut: addDays(t, 2), rooms })).toThrow("dates");
    expect(() => validateStayQuery({ city: "RUH", checkIn: addDays(t, 2), checkOut: addDays(t, 40), rooms })).toThrow("nights");
    expect(() => validateStayQuery({ city: "RUH", checkIn: addDays(t, 2), checkOut: addDays(t, 8), rooms, entry: "stopover" })).toThrow("stopoverNights");
  });

  it("books a prepaid rate, earns points, and refunds in full before the deadline", async () => {
    const u = user();
    const { offer, checkIn, checkOut } = await stayOffer((o) => o.rate!.pay === "online" && o.refundable);
    const stay = await bookStay(u, { offer, city: "RUH", checkIn, checkOut, rooms, entry: "evisa", lead, expectedTotalSAR: offer.totalSAR, card });
    expect(stay).toMatchObject({ status: "confirmed", pay: "online", totalSAR: offer.totalSAR, sandbox: true });
    expect(stay.confirmation).toMatch(/^[A-Z]{3}\d{8}$/);
    expect(stay.payment?.amountSAR).toBe(offer.totalSAR);
    expect(stay.loyalty?.earnedPoints).toBe(Math.floor(offer.totalSAR / 20));
    expect(stayCancelTerms(stay)).toMatchObject({ allowed: true, refundSAR: offer.totalSAR, feeSAR: 0 });
    const done = await cancelStay(u, stay.id);
    expect(done.cancellation?.refundSAR).toBe(offer.totalSAR);
    const acc = await getAccount(u.id);
    expect(acc!.entries.some((e) => e.type === "reverse")).toBe(true);
  });

  it("books a pay-at-hotel rate without charging", async () => {
    const u = user();
    const { offer, checkIn, checkOut } = await stayOffer((o) => o.rate!.pay === "hotel");
    const stay = await bookStay(u, { offer, city: "RUH", checkIn, checkOut, rooms, entry: "resident", lead, expectedTotalSAR: offer.totalSAR });
    expect(stay.payment).toBeNull();
    expect(stay.loyalty).toBeUndefined();
  });

  it("applies the cancellation terms after the deadline", async () => {
    const { offer } = await stayOffer((o) => o.rate!.pay === "online" && o.refundable);
    const base = { status: "confirmed", pay: "online", hotel: offer, totalSAR: offer.totalSAR, freeCancelUntil: offer.rate!.freeCancelUntil, payment: { amountSAR: offer.totalSAR } } as unknown as StayOrder;
    const late = new Date(Date.parse(offer.rate!.freeCancelUntil!) + 3_600_000);
    expect(stayCancelTerms(base, late)).toMatchObject({ allowed: true, feeSAR: offer.pricePerNightSAR, refundSAR: offer.totalSAR - offer.pricePerNightSAR });
    expect(stayCancelTerms({ ...base, hotel: { ...offer, refundable: false }, freeCancelUntil: null }, late)).toMatchObject({ refundSAR: 0, feeSAR: offer.totalSAR });
    expect(stayCancelTerms({ ...base, pay: "hotel", payment: null }, late)).toMatchObject({ allowed: true, refundSAR: 0, feeSAR: offer.pricePerNightSAR });
    expect(stayCancelTerms(base, new Date(Date.parse(`${offer.checkIn}T12:00:00+03:00`))).allowed).toBe(false);
  });

  it("refuses tampered offers and changed prices", async () => {
    const u = user();
    const { offer, checkIn, checkOut } = await stayOffer((o) => o.rate!.pay === "online");
    const input = { city: "RUH", checkIn, checkOut, rooms, entry: "evisa", lead, card };
    await expect(bookStay(u, { ...input, offer: { ...offer, totalSAR: 1 }, expectedTotalSAR: 1 })).rejects.toThrow("offerExpired");
    await expect(bookStay(u, { ...input, offer, expectedTotalSAR: offer.totalSAR - 5 })).rejects.toThrow("priceChanged");
    await expect(bookStay(u, { ...input, offer, rooms: [{ adults: 1, childAges: [] }], expectedTotalSAR: offer.totalSAR })).rejects.toThrow("offerMismatch");
    await expect(bookStay(u, { ...input, offer, expectedTotalSAR: offer.totalSAR, lead: { ...lead, email: "nope" } })).rejects.toThrow("email");
  });

  it("refunds the payment when the agent refuses", async () => {
    const u = user();
    const { offer, checkIn, checkOut } = await stayOffer((o) => o.rate!.pay === "online");
    await expect(bookStay(u, { offer, city: "RUH", checkIn, checkOut, rooms, entry: "evisa", lead: { ...lead, name: "Sandbox Reject" }, expectedTotalSAR: offer.totalSAR, card })).rejects.toThrow("agentRejected");
    expect(await store().findBy("stays", "userId", u.id)).toHaveLength(0);
  });

  it("moves a refundable booking to new dates and settles the difference", async () => {
    const u = user();
    const { offer, checkIn, checkOut } = await stayOffer((o) => o.rate!.pay === "online" && o.refundable);
    const stay = await bookStay(u, { offer, city: "RUH", checkIn, checkOut, rooms, entry: "gcc", lead, expectedTotalSAR: offer.totalSAR, card });
    const q = await quoteStayChange(u.id, stay.id, { checkIn: addDays(checkIn, 1), checkOut: addDays(checkOut, 2) });
    expect(q.offer.licenseNo).toBe(offer.licenseNo);
    const moved = await changeStayDates(u, stay.id, { offer: q.offer, card });
    expect(moved.hotel.checkIn).toBe(addDays(checkIn, 1));
    expect(moved.changes[0]).toMatchObject({ from: { checkIn }, chargedSAR: Math.max(0, q.differenceSAR), refundedSAR: Math.max(0, -q.differenceSAR) });
    await expect(quoteStayChange(u.id, stay.id, { checkIn: moved.hotel.checkIn, checkOut: moved.hotel.checkOut })).rejects.toThrow("sameDates");
  });

  it("reminds the day before check-in", async () => {
    const u = user();
    const { offer, checkIn, checkOut } = await stayOffer((o) => o.rate!.pay === "hotel", 1);
    await bookStay(u, { offer, city: "RUH", checkIn, checkOut, rooms, entry: "citizen", lead, expectedTotalSAR: offer.totalSAR });
    expect(await stayReminders(u.id)).toBe(1);
    expect(await stayReminders(u.id)).toBe(0);
  });
});

describe("standalone flights", () => {
  const pax = { adults: 1, children: 0, infants: 0 };
  const saudi = { type: "adult", nameEn: "Ahmed Ali", nationality: "SA", docType: "nationalId", docNo: "1012345678", birthDate: "1990-05-01" };
  const visitor = { type: "adult", nameEn: "John Smith", nationality: "GB", docType: "passport", docNo: "123456789", birthDate: "1985-03-02", passportExpiry: "2035-01-01" };
  const contact = { email: "a@example.com", phone: "+966501234567" };

  it("knows the kind of each route and the rules for passengers and documents", () => {
    expect(legKind("RUH", "JED")).toBe("domestic");
    expect(legKind("CAI", "RUH")).toBe("outbound");
    expect(legKind("RUH", "DXB")).toBe("return");
    expect(legKind("CAI", "DXB")).toBeNull();
    expect(legKind("RUH", "RUH")).toBeNull();
    expect(validDocNo("nationalId", "1012345678", "SA")).toBe(true);
    expect(validDocNo("nationalId", "1012345678", "EG")).toBe(false);
    expect(validDocNo("iqama", "2012345678", "EG")).toBe(true);
    expect(paxTypeOk("infant", "2025-06-01", "2026-10-01")).toBe(true);
    expect(paxTypeOk("infant", "2023-06-01", "2026-10-01")).toBe(false);
    expect(paxTypeOk("child", "2020-01-01", "2026-10-01")).toBe(true);
    expect(paxTypeOk("adult", "2016-01-01", "2026-10-01")).toBe(false);
  });

  it("applies the stopover rules", () => {
    expect(stopoverProblem({ arriveAt: "2026-10-10T08:00", carrierCode: "SV" }, { departAt: "2026-10-13T20:00", carrierCode: "XY" })).toBeNull();
    expect(stopoverProblem({ arriveAt: "2026-10-10T08:00", carrierCode: "SV" }, { departAt: "2026-10-14T09:00", carrierCode: "SV" })).toBe("stopoverTooLong");
    expect(stopoverProblem({ arriveAt: "2026-10-10T08:00", carrierCode: "EK" }, { departAt: "2026-10-11T09:00", carrierCode: "SV" })).toBe("stopoverCarrier");
  });

  it("books a domestic flight with a Saudi ID, earns points and refunds a refundable fare", async () => {
    const u = user();
    const date = addDays(today(), 12);
    const res = await searchStandaloneFlights({ from: "RUH", to: "JED", date, pax, cabin: "economy" });
    expect(res.kind).toBe("domestic");
    const offer = res.offers.find((o) => o.refundable) ?? res.offers[0];
    const order = await bookFlights(u, { entry: "citizen", tripType: "oneway", offers: [offer], passengers: [saudi], contact, expectedTotalSAR: offer.totalSAR, card });
    expect(order).toMatchObject({ scope: "domestic", status: "confirmed", totalSAR: offer.totalSAR });
    expect(order.segments[0].pnr).toMatch(/^[A-Z]{6}$/);
    expect(order.segments[0].tickets[0]).toMatch(/^\d{13}$/);
    expect(order.passengers[0].docMasked).toBe("••••••5678");
    expect(order.loyalty?.earnedPoints).toBe(Math.floor(offer.totalSAR / 20));
    const terms = flightCancelTerms(order);
    expect(terms.refundSAR).toBe(offer.refundable ? offer.totalSAR : 0);
    const done = await cancelFlightOrder(u, order.id);
    expect(done.status).toBe("cancelled");
  });

  it("requires a valid passport on international flights", async () => {
    const u = user();
    const date = addDays(today(), 15);
    const res = await searchStandaloneFlights({ from: "CAI", to: "RUH", date, pax, cabin: "economy" });
    const offer = res.offers[0];
    const base = { entry: "evisa", tripType: "oneway", offers: [offer], contact, expectedTotalSAR: offer.totalSAR, card };
    await expect(bookFlights(u, { ...base, passengers: [{ ...saudi, nationality: "SA" }] })).rejects.toThrow("passportRequired");
    await expect(bookFlights(u, { ...base, passengers: [{ ...visitor, passportExpiry: addDays(date, 30) }] })).rejects.toThrow("passportValidity");
    const ok = await bookFlights(u, { ...base, passengers: [visitor] });
    expect(ok.scope).toBe("international");
  });

  it("checks return trips and stopovers", async () => {
    const out = { from: "CAI", to: "RUH", departAt: "2026-12-01T09:00", arriveAt: "2026-12-01T12:00", carrierCode: "SV" } as FlightOffer;
    const back = { from: "RUH", to: "CAI", departAt: "2026-12-08T10:00", arriveAt: "2026-12-08T12:30", carrierCode: "MS" } as FlightOffer;
    const now = new Date("2026-10-01T00:00:00Z");
    expect(checkItinerary("return", [out, back], "evisa", now)).toBe("international");
    expect(() => checkItinerary("return", [out, { ...back, to: "DXB" }], "evisa", now)).toThrow("itinerary");
    const onward = { from: "RUH", to: "DXB", departAt: "2026-12-03T22:00", arriveAt: "2026-12-04T01:00", carrierCode: "XY" } as FlightOffer;
    expect(checkItinerary("stopover", [out, onward], "stopover", now)).toBe("international");
    expect(() => checkItinerary("stopover", [out, { ...onward, departAt: "2026-12-06T09:00" }], "stopover", now)).toThrow("stopoverTooLong");
    expect(() => checkItinerary("stopover", [out, onward], "evisa", now)).toThrow("stopoverEntry");
    expect(() => checkItinerary("oneway", [{ ...out, from: "RUH", to: "JED" }, onward], "evisa", now)).toThrow("itinerary");
  });

  it("reminds a day before each flight", async () => {
    const u = user();
    const res = await searchStandaloneFlights({ from: "RUH", to: "DMM", date: addDays(today(), 1), pax, cabin: "economy" });
    const soon = res.offers.find((o) => Date.parse(`${o.departAt}:00+03:00`) - Date.now() < 25 * 3_600_000);
    if (!soon) return; // every flight tomorrow may leave later than 26 hours from now
    await bookFlights(u, { entry: "resident", tripType: "oneway", offers: [soon], passengers: [{ ...visitor, nationality: "EG", docType: "iqama", docNo: "2012345678" }], contact, expectedTotalSAR: soon.totalSAR, card });
    expect(await flightReminders(u.id)).toBe(1);
  });
});
