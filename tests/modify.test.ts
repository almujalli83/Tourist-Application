import { describe, expect, it, vi } from "vitest";
import { searchActivities, searchFlights, searchHotels } from "@/lib/agents/aggregator";
import { executeModification, modificationEligibility, modificationOptions, quoteModification } from "@/lib/bookings/modify";
import { AGENTS } from "@/lib/agents/registry";
import type { PublicUser } from "@/lib/auth/types";
import { getBookingForUser, saveBooking, upsertSandboxPackage } from "@/lib/repo";
import type { StoredBooking } from "@/lib/bookings/types";
import { addDays } from "@/lib/dates";
import { buildLegs, stayDates } from "@/lib/itinerary";
import { paxFromRooms } from "@/lib/occupancy";
import { computePackagePrice } from "@/lib/pricing";
import type { SearchCriteria } from "@/lib/types";

const now = new Date("2026-09-25T09:00:00Z");
const rooms = [{ adults: 2, childAges: [] as number[] }];
const criteria: SearchCriteria = {
  origin: "CAI",
  stays: [{ city: "RUH", nights: 3 }, { city: "JED", nights: 3 }],
  departureDate: "2026-10-10",
  returnDate: "2026-10-16",
  rooms,
  pax: paxFromRooms(rooms),
  cabin: "economy",
  nationality: "EG",
};

async function makeBooking(overrides: Partial<StoredBooking> = {}): Promise<StoredBooking> {
  const flights = await Promise.all(buildLegs(criteria).map(async (leg) => (await searchFlights({ leg, pax: criteria.pax, cabin: "economy" })).offers[0]));
  const hotels = await Promise.all(stayDates(criteria).map(async (s) => (await searchHotels({ ...s, pax: criteria.pax, rooms })).offers[0]));
  const acts = (await searchActivities({ city: "JED", from: "2026-10-13", to: "2026-10-16", pax: criteria.pax })).offers;
  const activities = acts.filter((a) => a.date >= "2026-10-14").slice(0, 1);
  const price = computePackagePrice({ pax: criteria.pax, flights, hotels, activities, visaFeeSAR: 402.21 });
  const applicant = (n: string) => ({
    applicationNo: n, paxType: "adult" as const, nameEn: "A B", nationality: "EG", passportNo: "A1234567", email: `${n}@example.com`,
    sponsorApplicationNo: null, submission: null, appStatus: "COMPLETED", visaNumber: `60${n}`, visaIssueDate: "2026-09-20",
    visaExpiryDate: "2027-09-20", visaStatus: "ISSUED", insuranceStatus: "ISSUED",
  });
  return {
    id: "b1", reference: "TA-TEST", userId: "u1", accountType: "individual", clientReference: null, createdAt: "2026-09-20T10:00:00Z",
    criteria, flights, hotels, activities, price, displayCurrency: "SAR",
    payment: { transactionId: "TXN-1", method: "visa", last4: "1111", amountSAR: price.totalSAR, paidAt: "2026-09-20T10:00:00Z" },
    status: "COMPLETED",
    mt: { mode: "sandbox", messageId: "m1", packageId: "pkg-1", packageStatus: "COMPLETED", lastCheckedAt: null },
    applicants: [applicant("1"), applicant("2")],
    ticketNos: flights.map((_, i) => `T${i}`),
    modifications: [],
    ...overrides,
  };
}

describe("package update eligibility", () => {
  it("requires issued visas and closes 48 hours before the return flight", async () => {
    const b = await makeBooking();
    const el = modificationEligibility(b, now);
    expect(el).toMatchObject({ allowed: true, reason: null, currentReturnDate: "2026-10-16", visaExpiryDate: "2027-09-20", lastCity: "JED" });
    expect(el.maxReturnDate).toBe(addDays("2026-10-10", 88)); // package maximum before the visa expiry
    expect(el.minReturnDate).toBe("2026-10-12");
    const noVisa = await makeBooking({ applicants: b.applicants.map((a, i) => (i ? { ...a, visaNumber: null } : a)) });
    expect(modificationEligibility(noVisa, now).reason).toBe("visaNotIssued");
    const ret = b.flights.find((f) => f.kind === "return")!;
    const late = new Date(Date.parse(`${ret.departAt}:00+03:00`) - 47 * 3600_000);
    expect(modificationEligibility(b, late).reason).toBe("tooLate");
    const shortVisa = await makeBooking({ applicants: b.applicants.map((a) => ({ ...a, visaExpiryDate: "2026-10-20" })) });
    expect(modificationEligibility(shortVisa, now).maxReturnDate).toBe("2026-10-20");
  });
});

describe("package update quotes", () => {
  it("extends the same hotel with its agent and moves the return flight with the issuing agent", async () => {
    const b = await makeBooking();
    const opts = await modificationOptions(b, { newReturnDate: "2026-10-19", target: { mode: "lastCity" } }, now);
    const ret = b.flights.find((f) => f.kind === "return")!;
    expect(opts.returnFlights.every((f) => f.agentId === ret.agentId && f.from === "JED" && f.departAt.startsWith("2026-10-19"))).toBe(true);
    const same = opts.hotels[0];
    expect(same.id.startsWith("HX:")).toBe(true);
    expect(same).toMatchObject({ agentId: b.hotels[1].agentId, checkIn: "2026-10-16", checkOut: "2026-10-19", nights: 3 });
    const q = quoteModification(b, { newReturnDate: "2026-10-19", target: { mode: "lastCity" }, offers: { hotel: same, returnFlight: opts.returnFlights[0] } }, now);
    expect(q.kind).toBe("extend");
    expect(q.next.hotels).toHaveLength(2);
    expect(q.next.hotels[1]).toMatchObject({ checkOut: "2026-10-19", nights: 6 });
    expect(q.next.criteria.stays).toEqual([{ city: "RUH", nights: 3 }, { city: "JED", nights: 6 }]);
    expect(q.lines.map((l) => l.type)).toEqual(["hotelExtended", "flightChanged"]);
    expect(q.chargeSAR).toBeGreaterThan(0);
    // Tampered offers are rejected.
    expect(() => quoteModification(b, { newReturnDate: "2026-10-19", target: { mode: "lastCity" }, offers: { hotel: { ...same, totalSAR: 1 }, returnFlight: opts.returnFlights[0] } }, now)).toThrow("offerExpired");
  });

  it("extends in a new city reached by domestic flight, or by car without a flight", async () => {
    const b = await makeBooking();
    const opts = await modificationOptions(b, { newReturnDate: "2026-10-18", target: { mode: "newCity", city: "ULH", transport: "flight" } }, now);
    expect(opts.domesticFlights[0]).toMatchObject({ from: "JED", to: "ULH" });
    expect(opts.returnFlights[0]).toMatchObject({ from: "ULH", to: "CAI" });
    const q = quoteModification(b, {
      newReturnDate: "2026-10-18",
      target: { mode: "newCity", city: "ULH", transport: "flight" },
      offers: { hotel: opts.hotels.find((h) => !h.id.startsWith("HX:"))!, domesticFlight: opts.domesticFlights[0], returnFlight: opts.returnFlights[0] },
    }, now);
    expect(q.next.criteria.stays.at(-1)).toEqual({ city: "ULH", nights: 2 });
    expect(q.next.flights.map((f) => `${f.kind}:${f.from}-${f.to}`)).toEqual(["outbound:CAI-RUH", "domestic:RUH-JED", "domestic:JED-ULH", "return:ULH-CAI"]);
    const car = await modificationOptions(b, { newReturnDate: "2026-10-18", target: { mode: "newCity", city: "TIF", transport: "car" } }, now);
    expect(car.domesticFlights).toEqual([]);
    const qc = quoteModification(b, { newReturnDate: "2026-10-18", target: { mode: "newCity", city: "TIF", transport: "car" }, offers: { hotel: car.hotels[0], returnFlight: car.returnFlights[0] } }, now);
    expect(qc.lines.map((l) => l.type)).toEqual(["hotelAdded", "transport", "flightChanged"]);
  });

  it("shortens from the end: cancellations follow each service's refund policy", async () => {
    const b = await makeBooking();
    b.hotels[1] = { ...b.hotels[1], refundable: false, totalSAR: 900, nights: 3 };
    b.activities = b.activities.map((a) => ({ ...a, refundable: true }));
    const opts = await modificationOptions(b, { newReturnDate: "2026-10-14" }, now);
    expect(opts.kind).toBe("shorten");
    const q = quoteModification(b, { newReturnDate: "2026-10-14", offers: { returnFlight: opts.returnFlights[0] } }, now);
    const hotelLine = q.lines.find((l) => l.type === "hotelShortened")!;
    expect(hotelLine).toMatchObject({ amountSAR: 0, nonRefundableSAR: 600 }); // 2 of 3 nights, non-refundable
    // Non-refundable: the nights are cancelled but the paid amount stays in the package price.
    expect(q.next.hotels[1]).toMatchObject({ checkOut: "2026-10-14", nights: 1, totalSAR: 900 });
    expect(q.next.activities).toEqual([]);
    expect(q.lines.filter((l) => l.type === "activityCancelled").every((l) => l.amountSAR < 0)).toBe(true);
    expect(q.next.criteria).toMatchObject({ returnDate: "2026-10-14", stays: [{ city: "RUH", nights: 3 }, { city: "JED", nights: 1 }] });
    // Cutting the whole second city cancels its domestic flight and the return leaves from Riyadh.
    const early = await modificationOptions(b, { newReturnDate: "2026-10-13" }, now);
    expect(early.returnFlights[0].from).toBe("RUH");
    const q2 = quoteModification(b, { newReturnDate: "2026-10-13", offers: { returnFlight: early.returnFlights[0] } }, now);
    expect(q2.lines.map((l) => l.type)).toContain("flightCancelled");
    expect(q2.lines.map((l) => l.type)).toContain("hotelCancelled");
    // The cancelled non-refundable Jeddah hotel is retained in the price.
    expect(q2.next.price.retainedSAR).toBeGreaterThanOrEqual(900);
    expect(q2.next.price.totalSAR).toBeGreaterThan(q2.next.price.flightsSAR + q2.next.price.hotelsSAR);
  });

  it("works for bookings made before guests & rooms existed", async () => {
    const b = await makeBooking();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { rooms: _, ...legacyCriteria } = b.criteria;
    const legacy = { ...b, criteria: legacyCriteria as SearchCriteria };
    const opts = await modificationOptions(legacy, { newReturnDate: "2026-10-18", target: { mode: "newCity", city: "MED", transport: "flight" } }, now);
    expect(opts.hotels.length).toBeGreaterThan(0);
    expect(opts.unavailable).toEqual([]);
    const q = quoteModification(legacy, { newReturnDate: "2026-10-18", target: { mode: "newCity", city: "MED", transport: "flight" }, offers: { hotel: opts.hotels[0], domesticFlight: opts.domesticFlights[0], returnFlight: opts.returnFlights[0] } }, now);
    expect(q.next.criteria.rooms).toEqual([{ adults: 2, childAges: [] }]);
  });

  it("enforces the visa expiry and minimum duration", async () => {
    const b = await makeBooking({ applicants: (await makeBooking()).applicants.map((a) => ({ ...a, visaExpiryDate: "2026-10-18" })) });
    await expect(modificationOptions(b, { newReturnDate: "2026-10-19" }, now)).rejects.toThrow("beyondVisa");
    await expect(modificationOptions(b, { newReturnDate: "2026-10-11" }, now)).rejects.toThrow("tooShort");
  });
});

describe("applying a package change", () => {
  const user = { id: "u1", accountType: "individual", email: "u1@example.com" } as PublicUser;
  const card = { holder: "A B", number: "4111111111111111", expMonth: "12", expYear: "29", cvc: "123" };

  async function setup(id: string) {
    const b = await makeBooking({ id });
    // Visas issued far ahead; the change deadline depends on the real clock here.
    const ret = b.flights.find((f) => f.kind === "return")!;
    expect(Date.parse(`${ret.departAt}:00+03:00`)).toBeGreaterThan(Date.now());
    await saveBooking(b);
    // The package exists in the MT sandbox with visas issued.
    await upsertSandboxPackage("pkg-1", (p) => ({
      ...p,
      submittedAt: new Date(Date.now() - 86_400_000).toISOString(),
      applications: b.applicants.map((a) => ({ applicationNo: a.applicationNo, name: a.nameEn, countryId: "EG", passportNo: a.passportNo })),
    }));
    const opts = await modificationOptions(b, { newReturnDate: "2026-10-18", target: { mode: "lastCity" } });
    const plan = { newReturnDate: "2026-10-18", target: { mode: "lastCity" as const }, offers: { hotel: opts.hotels[0], returnFlight: opts.returnFlights[0] } };
    const q = quoteModification(b, plan);
    return { b, plan, q, input: { plan, expectedChargeSAR: q.chargeSAR, expectedRefundSAR: q.refundSAR, bookingVersion: q.bookingVersion, card } };
  }

  it("applies once per idempotency key and bumps the booking version", async () => {
    const { input } = await setup("exec-1");
    const first = await executeModification(user, "exec-1", { ...input, idempotencyKey: "key-1" });
    expect(first.replayed).toBe(false);
    expect(first.modification.agents?.length).toBeGreaterThan(0);
    expect(first.modification.mt.status).toBe("UPDATED");
    const again = await executeModification(user, "exec-1", { ...input, idempotencyKey: "key-1" });
    expect(again).toMatchObject({ replayed: true, modification: { id: first.modification.id } });
    const saved = await getBookingForUser("u1", "exec-1");
    expect(saved?.modifications).toHaveLength(1);
    expect(saved).toMatchObject({ version: 1, lock: null });
    // A second change priced on the old version is refused.
    await expect(executeModification(user, "exec-1", { ...input, idempotencyKey: "key-2" })).rejects.toThrow("bookingChanged");
  });

  it("refuses a change while another one is being applied", async () => {
    const { b, input } = await setup("exec-2");
    await saveBooking({ ...b, lock: { token: "other", at: new Date().toISOString() } });
    await expect(executeModification(user, "exec-2", { ...input, idempotencyKey: "k" })).rejects.toThrow("inProgress");
  });

  it("charges nothing when an agent rejects, and releases the other approvals", async () => {
    const { b, input } = await setup("exec-3");
    const hotelAgent = AGENTS.find((a) => a.id === b.hotels[1].agentId)!;
    const reject = vi.spyOn(hotelAgent, "requestChange").mockResolvedValue({ approved: false, reason: "noAvailability" });
    const released = AGENTS.map((a) => vi.spyOn(a, "releaseChange"));
    await expect(executeModification(user, "exec-3", { ...input, idempotencyKey: "k" })).rejects.toThrow("agentRejected");
    const saved = await getBookingForUser("u1", "exec-3");
    expect(saved?.modifications ?? []).toHaveLength(0);
    expect(saved?.lock ?? null).toBeNull();
    const returnAgentDiffers = b.flights.find((f) => f.kind === "return")!.agentId !== hotelAgent.id;
    if (returnAgentDiffers) expect(released.some((s) => s.mock.calls.length > 0)).toBe(true);
    reject.mockRestore();
    released.forEach((s) => s.mockRestore());
  });

  it("releases the agents when the payment is declined", async () => {
    const { input } = await setup("exec-4");
    const released = AGENTS.map((a) => vi.spyOn(a, "releaseChange"));
    await expect(executeModification(user, "exec-4", { ...input, card: { ...card, number: "4000000000000002" }, idempotencyKey: "k" })).rejects.toThrow("payment_declined");
    expect(released.some((s) => s.mock.calls.length > 0)).toBe(true);
    expect((await getBookingForUser("u1", "exec-4"))?.modifications ?? []).toHaveLength(0);
    released.forEach((s) => s.mockRestore());
  });
});
