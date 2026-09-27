import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicUser } from "@/lib/auth/types";
import type { StoredBooking } from "@/lib/bookings/types";
import { saveBooking } from "@/lib/repo";
import { store } from "@/lib/store";
import { providersFor } from "@/lib/transfers/providers";
import { cancelTransfer, getTransfer, listTransfers, planFromBooking, requestTransfer, transferOptions, transferReminders } from "@/lib/transfers/transfers";
import { suggestVehicle } from "@/lib/transfers/types";

const user = (id: string): PublicUser => ({ id, email: `${id}@example.com`, accountType: "individual", individual: { fullName: "Sara Ali", phone: "+966500000000", nationality: "EG" }, preferredLocale: "ar", preferredCurrency: "SAR", createdAt: "2026-01-01T00:00:00Z" });
const now = new Date("2026-10-01T09:00:00Z");

function booking(id: string, userId: string, firstCity = "RUH", visas = true): StoredBooking {
  const hotel = (city: string, checkIn: string, checkOut: string, lat: number, lng: number) => ({ city, nameAr: `فندق ${city}`, nameEn: `${city} Hotel`, checkIn, checkOut, lat, lng });
  return {
    id, reference: `TA-${id}`, userId, accountType: "individual", clientReference: null, createdAt: "2026-09-20T00:00:00Z",
    criteria: { origin: "CAI", stays: [{ city: firstCity, nights: 3 }], departureDate: "2026-10-10", returnDate: "2026-10-13", rooms: [{ adults: 2, childAges: [] }], pax: { adults: 2, children: 0, infants: 0 }, cabin: "economy", nationality: "EG", ...(firstCity === "MKX" ? { umrah: true } : {}) },
    flights: [
      { kind: "outbound", from: "CAI", to: firstCity === "MKX" ? "JED" : firstCity, departAt: "2026-10-10T08:00", arriveAt: "2026-10-10T11:30", flightNo: "SV310" },
      { kind: "return", from: firstCity === "MKX" ? "JED" : firstCity, to: "CAI", departAt: "2026-10-13T18:00", arriveAt: "2026-10-13T20:00", flightNo: "SV311" },
    ],
    hotels: [firstCity === "MKX" ? hotel("MKX", "2026-10-10", "2026-10-13", 21.42, 39.826) : hotel("RUH", "2026-10-10", "2026-10-13", 24.69, 46.685)],
    activities: [], price: { totalSAR: 1 }, displayCurrency: "SAR", payment: null, status: "COMPLETED",
    mt: { mode: "sandbox", messageId: "m", packageId: "p", packageStatus: "COMPLETED", lastCheckedAt: null },
    applicants: [
      { applicationNo: "1", nameEn: "SARA ALI", visaNumber: visas ? "601" : null, passportNo: "A1", nationality: "EG" },
      { applicationNo: "2", nameEn: "OMAR ALI", visaNumber: visas ? "602" : null, passportNo: "A2", nationality: "EG" },
    ],
    ticketNos: [], modifications: [],
  } as unknown as StoredBooking;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TRANSFER_PROVIDERS;
});

describe("airport transfers", () => {
  it("builds the ride from the package: landing → hotel, and hotel → airport in time for the flight", () => {
    const b = booking("tb0", "u0");
    expect(planFromBooking(b, "arrival")).toMatchObject({ airport: "RUH", flightNo: "SV310", pickupAt: "2026-10-10T11:30", place: { name: "RUH Hotel", lat: 24.69 }, pax: 2 });
    const d = planFromBooking(b, "departure")!;
    expect(d).toMatchObject({ airport: "RUH", flightAt: "2026-10-13T18:00" });
    const mins = (Date.parse(`${d.flightAt}:00+03:00`) - Date.parse(`${d.pickupAt}:00+03:00`)) / 60_000;
    expect(mins).toBeGreaterThanOrEqual(180 + 30);
    expect(Number(d.pickupAt.slice(14, 16)) % 15).toBe(0);
    expect(suggestVehicle(2, 2)).toBe("sedan");
    expect(suggestVehicle(5, 4)).toBe("suv");
    expect(suggestVehicle(8, 8)).toBe("van");
  });

  it("offers every vehicle with prices growing with the distance (Jeddah airport → Makkah costs more)", async () => {
    const u = user("tr-q");
    await saveBooking(booking("tb-ruh", u.id));
    await saveBooking(booking("tb-mkx", u.id, "MKX"));
    const ruh = await transferOptions(u, { bookingId: "tb-ruh", direction: "arrival" }, now);
    expect(ruh.quotes.map((q) => q.vehicle)).toEqual(["sedan", "suv", "van", "vip"]);
    expect(ruh.suggested).toBe("sedan");
    const mkx = await transferOptions(u, { bookingId: "tb-mkx", direction: "arrival" }, now);
    expect(mkx.plan.airport).toBe("JED");
    expect(mkx.quotes[0].priceSAR).toBeGreaterThan(ruh.quotes[0].priceSAR);
    expect(ruh.quotes.every((q, i) => i === 0 || q.priceSAR > ruh.quotes[i - 1].priceSAR)).toBe(true);
  });

  it("requests the ride, then follows the company until the driver is assigned; one per direction; cancellation rules", async () => {
    const u = user("tr-u1");
    await store().put("users", u.id, { ...u, passwordHash: "x" });
    await saveBooking(booking("tb1", u.id));
    const { quotes } = await transferOptions(u, { bookingId: "tb1", direction: "arrival" }, now);
    const sedan = quotes.find((q) => q.vehicle === "sedan")!;
    await expect(requestTransfer(u, { bookingId: "tb1", direction: "arrival", providerId: "sandbox", quoteId: "forged" }, now)).rejects.toMatchObject({ code: "quoteExpired" });
    const t = await requestTransfer(u, { bookingId: "tb1", direction: "arrival", providerId: "sandbox", quoteId: sedan.quoteId, extras: { childSeat: true }, notes: "Two big bags" }, now);
    expect(t).toMatchObject({ status: "requested", vehicle: "sedan", priceSAR: sedan.priceSAR, extras: { childSeat: true, wheelchair: false }, flightNo: "SV310", sandbox: true });
    expect(JSON.stringify(t)).not.toContain("+966500000000");
    await expect(requestTransfer(u, { bookingId: "tb1", direction: "arrival", providerId: "sandbox", quoteId: sedan.quoteId }, now)).rejects.toMatchObject({ code: "duplicate" });
    // Two minutes later the (sample) company confirms with a driver.
    expect((await getTransfer(u.id, t.id, new Date(now.getTime() + 60_000)))!.status).toBe("requested");
    const later = new Date(now.getTime() + 3 * 60_000);
    const c = (await getTransfer(u.id, t.id, later))!;
    expect(c.status).toBe("confirmed");
    expect(c.driver?.phone).toMatch(/^\+9665/);
    expect(await store().get("notifications", `transfer:confirmed:${t.id}`)).toMatchObject({ kind: "transport" });
    // Too late to cancel for free (12 h before pickup), fine before.
    await expect(cancelTransfer(u.id, t.id, new Date("2026-10-10T05:00:00Z"))).rejects.toMatchObject({ code: "tooLateToCancel" });
    expect((await cancelTransfer(u.id, t.id, later)).status).toBe("cancelled");
    // A new request is possible once the previous one is cancelled.
    await requestTransfer(u, { bookingId: "tb1", direction: "arrival", providerId: "sandbox", quoteId: sedan.quoteId }, later);
  });

  it("cancels the rides of a cancelled package, and offers a pickup once the visas are issued", async () => {
    const u = user("tr-u2");
    await store().put("users", u.id, { ...u, passwordHash: "x" });
    await saveBooking(booking("tb2", u.id, "RUH", false));
    expect(await transferReminders(u.id, now)).toBe(0);
    await saveBooking(booking("tb2", u.id));
    expect(await transferReminders(u.id, now)).toBe(1);
    expect(await store().get("notifications", "transfer:offer:tb2")).toMatchObject({ titleEn: "Would you like to be met at the airport?" });
    expect(await transferReminders(u.id, now)).toBe(0);
    const { quotes } = await transferOptions(u, { bookingId: "tb2", direction: "departure" }, now);
    const t = await requestTransfer(u, { bookingId: "tb2", direction: "departure", providerId: "sandbox", quoteId: quotes[0].quoteId }, now);
    await saveBooking({ ...booking("tb2", u.id), status: "CANCELLED" } as StoredBooking);
    const list = await listTransfers(u.id, now);
    expect(list.find((x) => x.id === t.id)).toMatchObject({ status: "cancelled", cancelReason: "packageCancelled" });
  });

  it("takes a ride entered by hand (no package), with the place from a map link", async () => {
    const u = user("tr-u3");
    await expect(transferOptions(u, { manual: { direction: "arrival", airport: "XXX", flightNo: "SV1", flightAt: "2026-10-05T10:00", placeName: "H", pax: 1, bags: 1 } }, now)).rejects.toMatchObject({ code: "invalidAirport" });
    await expect(transferOptions(u, { manual: { direction: "arrival", airport: "JED", flightNo: "??", flightAt: "2026-10-05T10:00", placeName: "H", pax: 1, bags: 1 } }, now)).rejects.toMatchObject({ code: "invalidFlight" });
    const o = await transferOptions(u, { manual: { direction: "departure", airport: "JED", flightNo: "sv 1020", flightAt: "2026-10-05T10:00", placeName: "Hilton Jeddah", placeLink: "https://maps.google.com/?q=21.54,39.17", pax: 5, bags: 5 } }, now);
    expect(o.plan).toMatchObject({ flightNo: "SV1020", place: { lat: 21.54, lng: 39.17 }, bookingId: null });
    expect(o.suggested).toBe("suv");
    const t = await requestTransfer(u, { manual: { direction: "departure", airport: "JED", flightNo: "SV1020", flightAt: "2026-10-05T10:00", placeName: "Hilton Jeddah", pax: 5, bags: 5 }, providerId: "sandbox", quoteId: (await transferOptions(u, { manual: { direction: "departure", airport: "JED", flightNo: "SV1020", flightAt: "2026-10-05T10:00", placeName: "Hilton Jeddah", pax: 5, bags: 5 } }, now)).quotes[1].quoteId }, now);
    expect(t).toMatchObject({ bookingId: null, vehicle: "suv" });
  });

  it("uses the linked companies' API when configured for the airport", async () => {
    process.env.TRANSFER_PROVIDERS = JSON.stringify([{ id: "acme", nameAr: "أكمي", nameEn: "Acme", url: "https://api.acme.example/v1/", token: "tok", airports: ["RUH"] }]);
    const calls: [string, RequestInit | undefined][] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (url.endsWith("/quotes")) return new Response(JSON.stringify([{ quoteId: "Q1", vehicle: "sedan", priceSAR: 199 }, { quoteId: "bad", vehicle: "bus", priceSAR: 1 }]), { status: 200 });
      if (url.endsWith("/bookings")) return new Response(JSON.stringify({ ref: "ACME-9", status: "confirmed", driver: { name: "Ali", phone: "+966511111111", car: "Camry", plate: "ABC 123" } }), { status: 201 });
      return new Response(null, { status: 204 });
    }));
    expect(providersFor("RUH").map((p) => p.id)).toEqual(["acme"]);
    expect(providersFor("JED").map((p) => p.id)).toEqual(["sandbox"]); // not covered by Acme: sandbox in sandbox mode
    const u = user("tr-u4");
    await saveBooking(booking("tb4", u.id));
    const o = await transferOptions(u, { bookingId: "tb4", direction: "arrival" }, now);
    expect(o.quotes).toEqual([expect.objectContaining({ quoteId: "Q1", providerId: "acme", priceSAR: 199, freeWaitMins: 60, freeCancelHours: 12 })]);
    expect((calls[0][1]!.headers as Record<string, string>).authorization).toBe("Bearer tok");
    const t = await requestTransfer(u, { bookingId: "tb4", direction: "arrival", providerId: "acme", quoteId: "Q1" }, now);
    expect(t).toMatchObject({ status: "confirmed", providerRef: "ACME-9", driver: { name: "Ali" } });
    expect(JSON.parse(String(calls.find((c) => c[0].endsWith("/bookings"))![1]!.body))).toMatchObject({ quoteId: "Q1", flightNo: "SV310", leadName: "SARA ALI", pax: 2 });
    // An empty status answer keeps the confirmed ride as it is.
    expect(await getTransfer(u.id, t.id, now)).toMatchObject({ status: "confirmed", driver: { name: "Ali" } });
  });
});
