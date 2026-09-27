import { describe, expect, it } from "vitest";
import { searchHotels } from "@/lib/agents/aggregator";
import { parseCoords, requestGuide } from "@/lib/guides/bookings";
import { eventRide, guideRide, packageRide, packageRideInfo, tableRide, trainRide } from "@/lib/transport/booking-rides";
import { STATIONS } from "@/lib/trains/network";

const ksa = (local: string) => Date.parse(`${local}:00+03:00`);
const pkg = packageRideInfo({
  status: "COMPLETED", mt: { packageStatus: "COMPLETED" },
  hotels: [
    { nameAr: "فندق جدة", nameEn: "Jeddah Hotel", lat: 21.54, lng: 39.17, checkIn: "2026-11-02", checkOut: "2026-11-04" },
    { nameAr: "فندق مكة", nameEn: "Makkah Hotel", lat: 21.42, lng: 39.82, checkIn: "2026-11-04", checkOut: "2026-11-06" },
  ],
  flights: [
    { kind: "outbound", from: "CAI", to: "JED", departAt: "2026-11-02T08:00", arriveAt: "2026-11-02T13:30" },
    { kind: "return", from: "JED", to: "CAI", departAt: "2026-11-06T18:00", arriveAt: "2026-11-06T20:00" },
  ],
});

describe("guide requests on a fresh store", () => {
  it("can request a sample guide before anyone opened the directory", async () => {
    const u = { id: "fresh-u", email: "fresh@example.com", accountType: "individual", preferredLocale: "en", preferredCurrency: "SAR", createdAt: "2026-01-01T00:00:00Z", individual: { fullName: "A B", phone: "", nationality: "FR" } } as const;
    const date = new Date(Date.now() + 3 * 3600e3 + 2 * 864e5).toISOString().slice(0, 10);
    const b = await requestGuide(u, { licenseNo: "TG-DEMO-1001", city: "RUH", date, startTime: "10:00", hours: 2, people: 1, language: "en" }, "https://x");
    expect(b.status).toBe("pending");
  });
});

describe("«Order a car» for the traveller's bookings", () => {
  it("package: from the day before arrival to the first hotel, tonight's hotel during the trip, the airport on departure day", () => {
    expect(packageRide(pkg, ksa("2026-10-30T10:00"), false)).toBeNull(); // too early
    const before = packageRide(pkg, ksa("2026-11-01T20:00"), false)!;
    expect(before).toMatchObject({ purpose: "hotel", to: { name: "Jeddah Hotel" } });
    expect(before.from).toBeDefined(); // estimate from the arrival airport
    expect(packageRide(pkg, ksa("2026-11-03T10:00"), true)).toMatchObject({ purpose: "hotel", to: { name: "فندق جدة" } });
    expect(packageRide(pkg, ksa("2026-11-05T10:00"), false)).toMatchObject({ to: { name: "Makkah Hotel" } });
    expect(packageRide(pkg, ksa("2026-11-06T09:00"), false)).toMatchObject({ purpose: "airport" });
    expect(packageRide(pkg, ksa("2026-11-06T19:00"), false)).toBeNull(); // after take-off
    expect(packageRide({ ...pkg, cancelled: true }, ksa("2026-11-03T10:00"), false)).toBeNull();
    // Older hotel offers without a location: no ride to the hotel.
    expect(packageRide({ ...pkg, hotels: pkg.hotels.map(({ lat: _a, lng: _b, ...h }) => h) }, ksa("2026-11-03T10:00"), false)).toBeNull(); // eslint-disable-line @typescript-eslint/no-unused-vars
  });

  it("event, table, train and guide: from the day before until it ends; never when cancelled", () => {
    const o = { status: "CONFIRMED", session: { start: "2026-11-10T17:00:00.000Z" }, event: { lat: 24.7, lng: 46.6, venueAr: "المسرح", venueEn: "Theatre", durationMins: 120 } };
    expect(eventRide(o, Date.parse("2026-11-08T17:00:00Z"), false)).toBeNull();
    expect(eventRide(o, Date.parse("2026-11-09T18:00:00Z"), false)).toMatchObject({ purpose: "venue", to: { name: "Theatre" } });
    expect(eventRide(o, Date.parse("2026-11-10T18:30:00Z"), false)).not.toBeNull();
    expect(eventRide(o, Date.parse("2026-11-10T19:30:00Z"), false)).toBeNull();
    expect(eventRide({ ...o, status: "CANCELLED" }, Date.parse("2026-11-10T16:00:00Z"), false)).toBeNull();

    const t = { status: "CONFIRMED", start: "2026-11-10T17:00:00.000Z", restaurant: { lat: 24.7, lng: 46.6, nameAr: "مطعم", nameEn: "Diner" } };
    expect(tableRide(t, Date.parse("2026-11-10T18:30:00Z"), false)).toMatchObject({ purpose: "restaurant" });
    expect(tableRide(t, Date.parse("2026-11-10T19:30:00Z"), false)).toBeNull();

    const tr = { status: "CONFIRMED", legs: [{ trip: { from: "JSL", depart: "2026-11-10T09:00:00.000Z" } }, { trip: { from: "MKK", depart: "2026-11-12T09:00:00.000Z" } }] };
    expect(trainRide(tr, STATIONS, Date.parse("2026-11-10T08:00:00Z"), false)).toMatchObject({ purpose: "station", to: { name: "Jeddah Al-Sulaimaniyah Station" } });
    expect(trainRide(tr, STATIONS, Date.parse("2026-11-11T10:00:00Z"), false)).toMatchObject({ to: { name: "Makkah Station" } });
    expect(trainRide(tr, STATIONS, Date.parse("2026-11-12T10:00:00Z"), false)).toBeNull();

    const g = { status: "confirmed", date: "2026-11-10", startTime: "09:00", hours: 3, guide: { nameAr: "عبدالله", nameEn: "Abdullah" }, meetingPoint: { text: "At-Turaif gate", lat: 24.73, lng: 46.57 } };
    expect(guideRide(g, ksa("2026-11-10T08:00"), false)).toMatchObject({ purpose: "meeting", to: { name: "At-Turaif gate" } });
    expect(guideRide({ ...g, meetingPoint: { text: "Gate", lat: null, lng: null } }, ksa("2026-11-10T08:00"), false)).toBeNull();
    expect(guideRide({ ...g, status: "pending" }, ksa("2026-11-10T08:00"), false)).toBeNull();
  });

  it("reads coordinates from map links", () => {
    expect(parseCoords("https://www.google.com/maps/place/At-Turaif/@24.7336,46.5753,17z")).toEqual({ lat: 24.7336, lng: 46.5753 });
    expect(parseCoords("https://maps.google.com/?q=24.7336,46.5753")).toEqual({ lat: 24.7336, lng: 46.5753 });
    expect(parseCoords("https://maps.apple.com/?ll=21.4225,39.8262&q=Haram")).toEqual({ lat: 21.4225, lng: 39.8262 });
    expect(parseCoords("24.7336, 46.5753")).toEqual({ lat: 24.7336, lng: 46.5753 });
    expect(parseCoords("the main gate")).toBeNull();
    expect(parseCoords("%E0%A4%A")).toBeNull();
  });

  it("gives hotels a location (near the Haram in Makkah)", async () => {
    const rooms = [{ adults: 2, childAges: [] as number[] }];
    const h = await searchHotels({ city: "MKX", checkIn: "2026-11-04", checkOut: "2026-11-06", pax: { adults: 2, children: 0, infants: 0 }, rooms });
    for (const o of h.offers) {
      expect(Math.abs(o.lat! - 21.4225)).toBeLessThan(0.01);
      expect(Math.abs(o.lng! - 39.8262)).toBeLessThan(0.01);
    }
  });
});
