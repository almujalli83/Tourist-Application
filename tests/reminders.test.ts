import { describe, expect, it } from "vitest";
import { searchFlights, searchHotels } from "@/lib/agents/aggregator";
import type { StoredBooking } from "@/lib/bookings/types";
import { buildLegs, stayDates } from "@/lib/itinerary";
import { listOutbox } from "@/lib/notify";
import { paxFromRooms } from "@/lib/occupancy";
import { computePackagePrice } from "@/lib/pricing";
import { deleteNotification, dueReminders, listNotifications, markRead, runReminders } from "@/lib/reminders/reminders";
import { saveBooking } from "@/lib/repo";
import type { SearchCriteria } from "@/lib/types";

const rooms = [{ adults: 2, childAges: [] as number[] }];
const criteria: SearchCriteria = {
  origin: "CAI", stays: [{ city: "RUH", nights: 3 }, { city: "JED", nights: 3 }],
  departureDate: "2026-10-10", returnDate: "2026-10-16", rooms, pax: paxFromRooms(rooms), cabin: "economy", nationality: "EG",
};
/** Saudi time. */
const at = (local: string) => new Date(`${local}+03:00`);

async function makeBooking(id: string, overrides: Partial<StoredBooking> = {}): Promise<StoredBooking> {
  const flights = await Promise.all(buildLegs(criteria).map(async (leg) => (await searchFlights({ leg, pax: criteria.pax, cabin: "economy" })).offers[0]));
  const hotels = await Promise.all(stayDates(criteria).map(async (s) => (await searchHotels({ ...s, pax: criteria.pax, rooms })).offers[0]));
  const price = computePackagePrice({ pax: criteria.pax, flights, hotels, activities: [], visaFeeSAR: 402.21 });
  const applicant = (n: string, expiry: string) => ({
    applicationNo: n, paxType: "adult" as const, nameEn: `TRAVELLER ${n}`, nationality: "EG", passportNo: "A1234567", email: `t${n}-${id}@example.com`,
    sponsorApplicationNo: null, submission: null, appStatus: "COMPLETED", visaNumber: `60${n}`, visaIssueDate: "2026-09-20",
    visaExpiryDate: expiry, visaStatus: "ISSUED", insuranceStatus: "ISSUED",
  });
  return {
    id, reference: `TA-${id}`, userId: `user-${id}`, accountType: "individual", clientReference: null, createdAt: "2026-09-20T10:00:00Z",
    criteria, flights, hotels, activities: [], price, displayCurrency: "SAR",
    payment: { transactionId: "TXN-1", method: "visa", last4: "1111", amountSAR: price.totalSAR, paidAt: "2026-09-20T10:00:00Z" },
    status: "COMPLETED", mt: { mode: "sandbox", messageId: "m1", packageId: "pkg-1", packageStatus: "COMPLETED", lastCheckedAt: null },
    applicants: [applicant("1", "2027-09-20"), applicant("2", "2027-09-19")], modifications: [],
    ...overrides,
  };
}
const kinds = (b: StoredBooking, now: Date) => dueReminders(b, now).map((r) => r.kind);

describe("trip reminders", () => {
  it("are due 3 days before arrival, the day before departure and before the visa expires", async () => {
    const b = await makeBooking("d1");
    expect(kinds(b, at("2026-10-06T09:00:00"))).toEqual([]);
    expect(kinds(b, at("2026-10-07T00:30:00"))).toEqual(["arrival"]);
    expect(kinds(b, at("2026-10-09T20:00:00"))).toEqual(["arrival"]);
    expect(kinds(b, at("2026-10-10T08:00:00"))).toEqual([]);
    expect(kinds(b, at("2026-10-15T09:00:00"))).toEqual(["departure"]);
    // Not once it's time to be at the airport.
    const ret = b.flights.find((f) => f.kind === "return")!;
    const late = new Date(Date.parse(`${ret.departAt}:00+03:00`) - 2 * 3600_000);
    expect(kinds(b, late)).toEqual([]);
    // The earliest visa expiry of the travellers.
    expect(dueReminders(b, at("2027-09-12T09:00:00"))).toEqual([{ kind: "visa7", id: "d1:visa7:2027-09-19" }]);
    expect(kinds(b, at("2027-09-18T09:00:00"))).toEqual(["visa1"]);
    expect(kinds(b, at("2027-09-20T09:00:00"))).toEqual([]);
    expect(kinds({ ...b, status: "CANCELLED" }, at("2026-10-08T09:00:00"))).toEqual([]);
    expect(kinds({ ...b, applicants: b.applicants.map((a) => ({ ...a, visaNumber: null })) }, at("2027-09-18T09:00:00"))).toEqual([]);
  });

  it("are created once, in the account and by email, and a deleted one isn't created again", async () => {
    const b = await makeBooking("r1");
    await saveBooking(b);
    const now = at("2026-10-08T09:00:00");
    const first = await runReminders(now);
    expect(first.created).toBeGreaterThanOrEqual(1);
    expect((await runReminders(now)).created).toBe(0);

    const list = await listNotifications(b.userId, now);
    expect(list).toHaveLength(1);
    const n = list[0];
    expect(n).toMatchObject({ kind: "arrival", readAt: null, href: "/account/bookings/r1" });
    expect(n.titleAr).toContain("بعد 2 أيام");
    expect(n.linesAr.join("\n")).toMatch(/رحلة الوصول .*الهبوط/);
    expect(n.linesAr.join("\n")).toContain("التأشيرات صادرة");
    expect(n.linesEn.join("\n")).toContain("No eSIM yet");
    expect(n.email?.to).toEqual(expect.arrayContaining(["t1-r1@example.com", "t2-r1@example.com"]));
    const mail = (await listOutbox()).find((m) => m.bookingId === "r1")!;
    expect(mail.subject).toContain("Your trip to Saudi Arabia is in 2 days");
    expect(mail.text).toContain("رحلتك إلى السعودية");

    await markRead(b.userId, now);
    expect((await listNotifications(b.userId, now))[0].readAt).not.toBeNull();
    expect(await deleteNotification("someone-else", n.id)).toBe(false);
    expect(await deleteNotification(b.userId, n.id)).toBe(true);
    expect(await listNotifications(b.userId, now)).toEqual([]);
    expect((await runReminders(now)).created).toBe(0);
    expect(await listNotifications(b.userId, at("2026-10-09T09:00:00"))).toEqual([]);

    // The departure reminder comes the day before the return flight.
    const dep = await listNotifications(b.userId, at("2026-10-15T09:00:00"));
    expect(dep.map((x) => x.kind)).toEqual(["departure"]);
    expect(dep[0].titleAr).toContain("موعد مغادرتك غدًا");
    expect(dep[0].linesAr.join("\n")).toMatch(/كن في المطار قبل الساعة \d\d:\d\d/);
  });

  it("warns travellers still in the country to leave before the visa expires", async () => {
    const b = await makeBooking("v1", { applicants: (await makeBooking("v1")).applicants.map((a) => ({ ...a, visaExpiryDate: "2026-10-20" })) });
    await saveBooking(b);
    const n = await listNotifications(b.userId, at("2026-10-14T09:00:00"));
    const visa = n.find((x) => x.kind === "visa7")!;
    expect(visa.titleEn).toContain("Your visa expires in 6 days");
    expect(visa.linesAr.join("\n")).toContain("يجب مغادرة المملكة");
    expect(visa.href).toBe("/account/wallet");
  });
});

describe("sample reminders (sandbox)", () => {
  it("shows one of each kind once to a traveller without notifications, and not after deleting them", async () => {
    const { seedDemoNotifications } = await import("@/lib/reminders/demo");
    const now = at("2026-09-26T09:00:00");
    await seedDemoNotifications("demo-user", now);
    const list = await listNotifications("demo-user", now);
    expect(list.map((n) => n.kind)).toEqual(["review", "arrival", "departure", "visa7", "visa1"]);
    expect(list[0]).toMatchObject({ href: "/account/reviews", demo: true });
    await deleteNotification("demo-user", list.shift()!.id, now);
    expect(list.every((n) => n.demo && !n.email)).toBe(true);
    expect(list[0].titleAr).toBe("رحلتك إلى السعودية بعد 3 أيام — TA-DEMO2026");
    expect(list[0].linesAr.join("\n")).toContain("السعودية SV306");
    expect(list[0].linesAr.join("\n")).toContain("أول يوم في برنامجك");
    expect(list[1].titleAr).toContain("موعد مغادرتك غدًا");
    expect(list[2].titleEn).toContain("Your visa expires in 7 days");
    for (const n of list) await deleteNotification("demo-user", n.id, now);
    await seedDemoNotifications("demo-user", now);
    expect(await listNotifications("demo-user", now)).toEqual([]);
  });
});
