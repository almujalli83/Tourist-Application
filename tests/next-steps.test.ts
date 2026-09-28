import { describe, expect, it } from "vitest";
import { flightAirportLegs, flightStays, flightWindow, matchingFlight, matchingStay, nextSteps, stayWindow, tripFlightsHref, tripHotelSteps, tripHotelsHref } from "@/lib/standalone/next-steps";
import type { FlightOrder, StayOrder } from "@/lib/standalone/types";

const seg = (from: string, to: string, departAt: string, arriveAt: string, flightNo = "XY255") =>
  ({ offer: { from, to, departAt, arriveAt, flightNo }, pnr: "PNR", tickets: ["1"], priceSAR: 100 }) as unknown as FlightOrder["segments"][number];

const flight = (over: Partial<FlightOrder>): FlightOrder => ({
  id: "f1", reference: "FL-1", entry: "evisa", tripType: "oneway", scope: "domestic", segments: [], passengers: [{} as FlightOrder["passengers"][number]],
  contact: { email: "a@example.com", phone: "+966501234567" }, totalSAR: 366, status: "confirmed", payment: {} as FlightOrder["payment"], cancellation: null, createdAt: "", ...over,
});

const stay = (over: Partial<StayOrder["hotel"]> = {}, rest: Partial<StayOrder> = {}): StayOrder => ({
  id: "s1", reference: "ST-1", confirmation: "C", entry: "evisa",
  hotel: { city: "JED", checkIn: "2026-10-08", checkOut: "2026-10-11", nameAr: "فندق", nameEn: "Hotel", ...over } as StayOrder["hotel"],
  rooms: [{ adults: 2, childAges: [5] }], lead: { name: "A B", email: "a@example.com", phone: "+966501234567" }, requests: "", pay: "hotel", totalSAR: 1000,
  freeCancelUntil: null, status: "confirmed", payment: null, cancellation: null, changes: [], createdAt: "", ...rest,
});

describe("complete your trip", () => {
  it("one-way domestic flight: stay in the arrival city for a few nights, transfers at both airports", () => {
    const o = flight({ segments: [seg("RUH", "JED", "2026-10-08T09:00", "2026-10-08T10:38")] });
    const w = flightWindow(o)!;
    expect(w).toMatchObject({ city: "JED", from: "2026-10-08", to: "2026-10-11", international: false, arrival: { airport: "JED", at: "2026-10-08T10:38", flightNo: "XY255" } });
    expect(w.departure).toBeUndefined();
    expect(flightAirportLegs(o).map((l) => `${l.direction}:${l.airport}`)).toEqual(["departure:RUH", "arrival:JED"]);

    const steps = nextSteps(w, { flight: true }, flightAirportLegs(o));
    const keys = steps.map((s) => s.key);
    expect(keys).toEqual(["hotel", "transfer", "transfer", "rental", "events", "restaurants", "guides", "prayer"]);
    expect(steps[0].href).toBe("/hotels?entry=evisa&city=JED&checkIn=2026-10-08&checkOut=2026-10-11");
    expect(steps[2].href).toContain("transfer=arrival&airport=JED&flight=XY255&at=2026-10-08T10%3A38&pax=1");
    expect(steps.find((s) => s.key === "rental")!.href).toBe("/transport?city=JED&pickupAt=2026-10-08T11%3A38&returnAt=2026-10-11T10%3A00#rental");
    expect(steps.find((s) => s.key === "events")!.href).toBe("/events?city=JED&from=2026-10-08&to=2026-10-11");
  });

  it("international return: stays until the return flight, eSIM offered, car returned before take-off", () => {
    const o = flight({ tripType: "return", scope: "international", segments: [seg("CAI", "RUH", "2026-10-08T02:00", "2026-10-08T05:10", "SV310"), seg("RUH", "CAI", "2026-10-15T20:00", "2026-10-15T22:30", "SV311")] });
    const w = flightWindow(o)!;
    expect(w).toMatchObject({ city: "RUH", from: "2026-10-08", to: "2026-10-15", international: true, departure: { airport: "RUH", at: "2026-10-15T20:00" } });
    const steps = nextSteps(w, { flight: true });
    expect(steps.map((s) => s.key)).toContain("esim");
    expect(steps.find((s) => s.key === "rental")!.href).toContain("pickupAt=2026-10-08T06%3A10&returnAt=2026-10-15T17%3A00");
  });

  it("stopover: the transit city between the two flights; flights abroad only give no stay", () => {
    const o = flight({ tripType: "stopover", entry: "stopover", segments: [seg("CAI", "JED", "2026-10-08T02:00", "2026-10-08T04:00"), seg("JED", "DXB", "2026-10-10T20:00", "2026-10-10T23:00")] });
    expect(flightWindow(o)).toMatchObject({ city: "JED", from: "2026-10-08", to: "2026-10-10", entry: "stopover" });
    const out = flight({ segments: [seg("RUH", "CAI", "2026-10-08T09:00", "2026-10-08T11:00")], scope: "international", entry: "resident" });
    expect(flightWindow(out)).toBeNull();
    expect(flightAirportLegs(out)).toEqual([{ direction: "departure", airport: "RUH", flightNo: "XY255", at: "2026-10-08T09:00" }]);
  });

  it("hotel: dates from the stay, flights matched when booked here, no hotel link", () => {
    const f = flight({ segments: [seg("RUH", "JED", "2026-10-08T09:00", "2026-10-08T10:38")] });
    const back = flight({ id: "f2", segments: [seg("JED", "RUH", "2026-10-11T18:00", "2026-10-11T19:30", "XY260")] });
    const s = stay();
    const w = stayWindow(s, [f, back]);
    expect(w).toMatchObject({ city: "JED", from: "2026-10-08", to: "2026-10-11", pax: 3, arrival: { flightNo: "XY255" }, departure: { flightNo: "XY260", at: "2026-10-11T18:00" } });
    expect(matchingFlight(w, [f])?.id).toBe("f1");
    const steps = nextSteps(w, { stay: true, flight: true, hotelName: "Hotel" });
    expect(steps.map((x) => x.key)).not.toContain("hotel");
    expect(steps.find((x) => x.key === "transfer")!.href).toContain("place=Hotel");

    // Without flights: a flight link (Makkah flies to Jeddah) and a generic airport pickup.
    const mk = nextSteps(stayWindow(stay({ city: "MKX" })), { stay: true });
    expect(mk.find((x) => x.key === "flight")!.href).toContain("to=JED");
    expect(mk.map((x) => x.key)).not.toContain("rental");
    const jed = nextSteps(stayWindow(s), { stay: true });
    expect(jed.find((x) => x.key === "transfer")!.href).toContain("transfer=arrival&airport=JED&at=2026-10-08T12%3A00");
  });

  it("matches only live stays that overlap in the same city", () => {
    const w = { city: "JED", from: "2026-10-08", to: "2026-10-11" };
    expect(matchingStay(w, [stay()])?.id).toBe("s1");
    expect(matchingStay(w, [stay({}, { status: "cancelled" })])).toBeUndefined();
    expect(matchingStay(w, [stay({ city: "RUH" })])).toBeUndefined();
    expect(matchingStay(w, [stay({ checkIn: "2026-10-11", checkOut: "2026-10-13" })])).toBeUndefined();
  });

  it("multi-city flights → the nights in each city → one multi-city hotel search", () => {
    const o = flight({ tripType: "multicity", scope: "international", segments: [
      seg("CAI", "RUH", "2026-11-07T02:00", "2026-11-07T05:00"), seg("RUH", "ULH", "2026-11-10T09:00", "2026-11-10T10:30"),
      seg("ULH", "JED", "2026-11-12T12:00", "2026-11-12T13:20"), seg("JED", "CAI", "2026-11-14T20:00", "2026-11-14T22:00"),
    ] });
    const stays = flightStays(o);
    expect(stays).toEqual([{ city: "RUH", from: "2026-11-07", to: "2026-11-10" }, { city: "ULH", from: "2026-11-10", to: "2026-11-12" }, { city: "JED", from: "2026-11-12", to: "2026-11-14" }]);
    expect(tripHotelsHref(stays, "evisa")).toBe("/hotels?mode=multi&entry=evisa&start=2026-11-07&leg=RUH%3A3&leg=ULH%3A2&leg=JED%3A2");
    // A cancelled flight drops out of the plan and the airport list.
    const cut = { ...o, segments: o.segments.map((sg, i) => (i === 2 ? { ...sg, cancellation: { at: "", refundSAR: 0 } } : sg)) };
    expect(flightAirportLegs(cut).some((l) => l.airport === "ULH" && l.direction === "departure")).toBe(false);
    expect(tripHotelsHref([stays[0]], "evisa")).toBeNull();
  });

  it("multi-city hotels → every flight of the trip (Makkah via Jeddah, no flight between Jeddah and Makkah)", () => {
    const st = (city: string, checkIn: string, checkOut: string) => stay({ city, checkIn, checkOut });
    const href = tripFlightsHref([st("RUH", "2026-11-07", "2026-11-10"), st("JED", "2026-11-10", "2026-11-12"), st("MKX", "2026-11-12", "2026-11-14")], "evisa", "CAI")!;
    const legs = new URLSearchParams(href.split("?")[1]).getAll("leg");
    expect(href.startsWith("/flights?entry=evisa&trip=multi")).toBe(true);
    expect(legs).toEqual(["CAI:RUH:2026-11-07", "RUH:JED:2026-11-10", "JED:CAI:2026-11-14"]);
    // Residents from Riyadh: no flight from Riyadh to Riyadh.
    const res = new URLSearchParams(tripFlightsHref([st("RUH", "2026-11-07", "2026-11-09"), st("ULH", "2026-11-09", "2026-11-11")], "resident", "RUH")!.split("?")[1]).getAll("leg");
    expect(res).toEqual(["RUH:ULH:2026-11-09", "ULH:RUH:2026-11-11"]);
  });

  it("a visitor's loop Riyadh → AlUla → Jeddah → Riyadh stays in all three cities; booked cities drop out", () => {
    const o = flight({ tripType: "multicity", entry: "evisa", segments: [
      seg("RUH", "ULH", "2026-10-08T19:45", "2026-10-08T21:06"), seg("ULH", "JED", "2026-10-11T08:30", "2026-10-11T09:57"), seg("JED", "RUH", "2026-10-13T14:15", "2026-10-13T15:28"),
    ] });
    const nights = flightStays(o);
    expect(nights.map((n) => `${n.city} ${n.from}→${n.to}`)).toEqual(["ULH 2026-10-08→2026-10-11", "JED 2026-10-11→2026-10-13", "RUH 2026-10-13→2026-10-16"]);
    const all = tripHotelSteps(nights, "evisa");
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ key: "tripHotels", count: 3, cities: ["ULH", "JED", "RUH"] });
    // AlUla already booked: Jeddah then Riyadh remain, still one multi-city search.
    const withUlh = tripHotelSteps(nights, "evisa", [stay({ city: "ULH", checkIn: "2026-10-08", checkOut: "2026-10-11" })]);
    expect(withUlh).toHaveLength(1);
    expect(withUlh[0]).toMatchObject({ key: "tripHotels", cities: ["JED", "RUH"] });
    expect(withUlh[0].href).toContain("start=2026-10-11&leg=JED%3A2&leg=RUH%3A3");
    // Jeddah booked: AlUla and Riyadh no longer follow on — one hotel link each.
    const withJed = tripHotelSteps(nights, "evisa", [stay({ city: "JED", checkIn: "2026-10-11", checkOut: "2026-10-13" })]);
    expect(withJed.map((x) => `${x.key}:${x.stay?.city}`)).toEqual(["hotel:ULH", "hotel:RUH"]);
    // Residents fly home: no hotel after the last flight.
    expect(flightStays({ ...o, entry: "resident" }).map((n) => n.city)).toEqual(["ULH", "JED"]);
  });
});
