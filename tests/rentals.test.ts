import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicUser } from "@/lib/auth/types";
import type { StoredBooking } from "@/lib/bookings/types";
import { saveBooking } from "@/lib/repo";
import { store } from "@/lib/store";
import { DEFAULT_LICENCE_RULES, getLicenceRules, ruleFor, setLicenceRules } from "@/lib/rentals/licence";
import { rentalProvidersFor } from "@/lib/rentals/providers";
import { cancelRental, getRental, listRentals, rentalOptions, rentalPlansFromBooking, rentalReminders, requestRental, validateQuery } from "@/lib/rentals/rentals";
import { rentalDays, type RentalQuery } from "@/lib/rentals/types";

const user = (id: string): PublicUser => ({ id, email: `${id}@example.com`, accountType: "individual", individual: { fullName: "Sara Ali", phone: "+966500000000", nationality: "EG" }, preferredLocale: "ar", preferredCurrency: "SAR", createdAt: "2026-01-01T00:00:00Z" });
const now = new Date("2026-10-01T09:00:00Z");
const q = (o: Partial<RentalQuery> = {}): RentalQuery => ({ city: "ULH", pickupSpot: "airport", dropoffCity: "ULH", dropoffSpot: "airport", pickupAt: "2026-10-10T12:00", returnAt: "2026-10-13T10:00", driverAge: 30, licenceCountry: "EG", ...o });

function booking(id: string, userId: string): StoredBooking {
  const hotel = (city: string, checkIn: string, checkOut: string) => ({ city, nameAr: `فندق ${city}`, nameEn: `${city} Hotel`, checkIn, checkOut, lat: 26.6, lng: 37.9 });
  return {
    id, reference: `TA-${id}`, userId, accountType: "individual", clientReference: null, createdAt: "2026-09-20T00:00:00Z",
    criteria: { origin: "CAI", stays: [{ city: "RUH", nights: 2 }, { city: "ULH", nights: 3 }], departureDate: "2026-10-10", returnDate: "2026-10-15", rooms: [{ adults: 2, childAges: [] }], pax: { adults: 2, children: 0, infants: 0 }, cabin: "economy", nationality: "EG" },
    flights: [
      { kind: "outbound", from: "CAI", to: "RUH", departAt: "2026-10-10T08:00", arriveAt: "2026-10-10T11:30", flightNo: "SV310" },
      { kind: "domestic", from: "RUH", to: "ULH", departAt: "2026-10-12T09:00", arriveAt: "2026-10-12T10:30", flightNo: "SV1500" },
      { kind: "return", from: "ULH", to: "CAI", departAt: "2026-10-15T18:00", arriveAt: "2026-10-15T20:00", flightNo: "SV311" },
    ],
    hotels: [hotel("RUH", "2026-10-10", "2026-10-12"), hotel("ULH", "2026-10-12", "2026-10-15")],
    activities: [], price: { totalSAR: 1 }, displayCurrency: "SAR", payment: null, status: "COMPLETED",
    mt: { mode: "sandbox", messageId: "m", packageId: "p", packageStatus: "COMPLETED", lastCheckedAt: null },
    applicants: [{ applicationNo: "1", nameEn: "SARA ALI", visaNumber: "601", passportNo: "A1", nationality: "EG" }],
    ticketNos: [], modifications: [],
  } as unknown as StoredBooking;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RENTAL_PROVIDERS;
});

describe("rental search", () => {
  it("counts rental days (an hour of grace)", () => {
    expect(rentalDays("2026-10-10T12:00", "2026-10-13T10:00")).toBe(3);
    expect(rentalDays("2026-10-10T12:00", "2026-10-13T12:59")).toBe(3);
    expect(rentalDays("2026-10-10T12:00", "2026-10-13T14:00")).toBe(4);
  });

  it("validates the search", () => {
    expect(validateQuery(q({ city: "ruh", dropoffCity: "" }), now)).toMatchObject({ city: "RUH", dropoffCity: "RUH" });
    expect(() => validateQuery(q({ city: "XXX" }), now)).toThrow("invalidCity");
    expect(() => validateQuery(q({ city: "MKX", dropoffCity: "MKX" }), now)).toThrow("noAirport");
    expect(() => validateQuery(q({ pickupAt: "2026-10-01T12:30" }), now)).toThrow("tooSoon");
    expect(() => validateQuery(q({ returnAt: "2026-10-10T20:00" }), now)).toThrow("tooShort");
    expect(() => validateQuery(q({ returnAt: "2026-12-30T10:00" }), now)).toThrow("tooLong");
    expect(() => validateQuery(q({ driverAge: 17 }), now)).toThrow("invalidAge");
    expect(() => validateQuery(q({ licenceCountry: "ZZ" }), now)).toThrow("invalidCountry");
  });

  it("suggests one rental per stay from the package", () => {
    const [ruh, ulh] = rentalPlansFromBooking(booking("rb0", "u0"));
    expect(ruh).toMatchObject({ city: "RUH", pickupSpot: "airport", pickupAt: "2026-10-10T13:00", dropoffSpot: "city", returnAt: "2026-10-12T10:00", licenceCountry: "EG" });
    expect(ulh).toMatchObject({ city: "ULH", pickupSpot: "city", pickupAt: "2026-10-12T10:00", dropoffSpot: "airport", returnAt: "2026-10-15T14:00" });
  });

  it("returns every class with the one-way fee, extras and the licence rule for the driver", async () => {
    const o = await rentalOptions(q(), now);
    expect(o.quotes.map((x) => x.carClass)).toEqual(["economy", "sedan", "suv", "4x4", "luxury"]);
    expect(o.quotes[0]).toMatchObject({ days: 3, totalSAR: 360, oneWayFeeSAR: 0, extras: { fullInsurance: 135 } });
    expect(o.licence?.id).toBe("general");
    expect(o.reviewed).toBe(false);
    const oneWay = await rentalOptions(q({ dropoffCity: "MED" }), now);
    expect(oneWay.quotes[0].oneWayFeeSAR).toBeGreaterThan(0);
    expect((await rentalOptions(q({ licenceCountry: "KW" }), now)).licence?.id).toBe("gcc");
  });

  it("links companies by API (quotes mapped and checked)", async () => {
    process.env.RENTAL_PROVIDERS = JSON.stringify([{ id: "acme", nameAr: "أكمي", nameEn: "Acme", url: "https://api.acme.test/v1", token: "t", cities: ["ULH"] }]);
    const f = vi.fn(async () => new Response(JSON.stringify([
      { quoteId: "A1", carClass: "4x4", model: "Nissan Patrol", pricePerDaySAR: 400, oneWayFeeSAR: 0, depositSAR: 2500, extras: { fullInsurance: 50 }, minAge: 25 },
      { quoteId: "bad", carClass: "boat", pricePerDaySAR: 10 },
    ]), { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect(rentalProvidersFor("ULH").map((p) => p.id)).toEqual(["acme"]);
    const o = await rentalOptions(q(), now);
    expect(o.quotes).toHaveLength(1);
    expect(o.quotes[0]).toMatchObject({ providerId: "acme", carClass: "4x4", totalSAR: 1200, extras: { fullInsurance: 150 }, minAge: 25 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.acme.test/v1/quotes");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer t");
  });
});

describe("rental bookings", () => {
  it("books the car (re-quoted), follows the company to confirmation, reminds and cancels", async () => {
    const u = user("rn-u1");
    await store().put("users", u.id, { ...u, passwordHash: "x" });
    await saveBooking(booking("rb1", u.id));
    const o = await rentalOptions(q(), now);
    const suv = o.quotes.find((x) => x.carClass === "suv")!;
    const base = { ...q(), bookingId: "rb1", providerId: "sandbox", quoteId: suv.quoteId, extras: ["fullInsurance", "boat"], acceptLicence: true };
    await expect(requestRental(u, { ...base, acceptLicence: false }, now)).rejects.toMatchObject({ code: "licenceNotAccepted" });
    await expect(requestRental(u, { ...base, quoteId: "forged" }, now)).rejects.toMatchObject({ code: "quoteExpired" });
    const young = (await rentalOptions(q({ driverAge: 21 }), now)).quotes.find((x) => x.carClass === "suv")!;
    await expect(requestRental(u, { ...base, driverAge: 21, quoteId: young.quoteId }, now)).rejects.toMatchObject({ code: "driverTooYoung" });
    const r = await requestRental(u, base, now);
    expect(r).toMatchObject({ status: "requested", carClass: "suv", extras: ["fullInsurance"], totalSAR: suv.totalSAR + suv.extras.fullInsurance!, bookingReference: "TA-rb1", driverName: "Sara Ali", sandbox: true });
    expect(JSON.stringify(r)).not.toContain("+966500000000");
    await expect(requestRental(u, { ...base, pickupAt: "2026-10-11T12:00", returnAt: "2026-10-14T10:00" }, now)).rejects.toMatchObject({ code: "overlap" });

    const later = new Date(now.getTime() + 3 * 60_000);
    const c = (await getRental(u.id, r.id, later))!;
    expect(c.status).toBe("confirmed");
    expect(c.confirmation).toMatch(/^CR[0-9A-F]{6}$/);
    expect(c.counter?.address).toContain("AlUla");
    const notes = await store().findBy<{ id: string }>("notifications", "userId", u.id);
    expect(notes.some((n) => n.id === `rental:confirmed:${r.id}`)).toBe(true);

    // The day before pickup, then the day before the return.
    expect(await rentalReminders(u.id, new Date("2026-10-09T12:00:00Z"))).toBe(1);
    expect(await rentalReminders(u.id, new Date("2026-10-09T13:00:00Z"))).toBe(0);
    expect(await rentalReminders(u.id, new Date("2026-10-12T12:00:00Z"))).toBe(1);

    await expect(cancelRental(u.id, r.id, new Date("2026-10-10T02:00:00Z"))).rejects.toMatchObject({ code: "tooLateToCancel" });
    expect((await cancelRental(u.id, r.id, later)).status).toBe("cancelled");
  });

  it("cancels the rentals of a cancelled package", async () => {
    const u = user("rn-u2");
    const b = booking("rb2", u.id);
    await saveBooking(b);
    const o = await rentalOptions(q(), now);
    const r = await requestRental(u, { ...q(), bookingId: "rb2", providerId: "sandbox", quoteId: o.quotes[0].quoteId, acceptLicence: true }, now);
    await saveBooking({ ...b, status: "CANCELLED" } as StoredBooking);
    const list = await listRentals(u.id, now);
    expect(list.find((x) => x.id === r.id)).toMatchObject({ status: "cancelled", cancelReason: "packageCancelled" });
  });
});

describe("licence rules", () => {
  it("defaults, lookup and editing by operations", async () => {
    expect(ruleFor(DEFAULT_LICENCE_RULES, "ae")?.id).toBe("gcc");
    expect(ruleFor(DEFAULT_LICENCE_RULES, "FR")?.id).toBe("general");
    await expect(setLicenceRules({ rules: [{ countries: "FR", titleAr: "أ", titleEn: "A", requirementsAr: ["x"], requirementsEn: ["x"] }] }, "ops@example.com")).rejects.toThrow("noGeneralRule");
    await expect(setLicenceRules({ rules: [{ countries: "*", titleAr: "", titleEn: "A", requirementsAr: ["x"], requirementsEn: ["x"] }] }, "ops@example.com")).rejects.toThrow("invalidRules");
    const saved = await setLicenceRules({
      rules: [
        { id: "eu", countries: "fr, de ,xx1", titleAr: "رخصة أوروبية", titleEn: "EU licence", requirementsAr: ["أ", " "], requirementsEn: ["a"] },
        { id: "all", countries: ["*"], titleAr: "عام", titleEn: "General", requirementsAr: ["ب"], requirementsEn: ["b"] },
      ],
      sourceUrl: "javascript:alert(1)", reviewed: true,
    }, "ops@example.com", now);
    expect(saved.rules[0]).toMatchObject({ countries: ["FR", "DE"], requirementsAr: ["أ"] });
    expect(saved.sourceUrl).toBe(DEFAULT_LICENCE_RULES.sourceUrl);
    expect(saved.reviewedBy).toBe("ops@example.com");
    const kept = await getLicenceRules();
    expect(ruleFor(kept, "DE")?.id).toBe("eu");
    expect((await rentalOptions(q({ licenceCountry: "DE" }), now)).reviewed).toBe(true);
    await store().delete("config", "rentalLicenceRules");
  });
});
