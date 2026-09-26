import { afterEach, describe, expect, it } from "vitest";
import { searchFlights, searchHotels } from "@/lib/agents/aggregator";
import type { PublicUser } from "@/lib/auth/types";
import type { StoredBooking } from "@/lib/bookings/types";
import { hotelClassAllowed } from "@/lib/config";
import { buildLegs, stayDates } from "@/lib/itinerary";
import { listOutbox } from "@/lib/notify";
import { paxFromRooms } from "@/lib/occupancy";
import { computePackagePrice } from "@/lib/pricing";
import { listNotifications } from "@/lib/reminders/reminders";
import { saveBooking } from "@/lib/repo";
import {
  adminModerate, adminReply, adminReviews, myReviews, pendingReviews, requestReviews, serviceRatings, submitReview, summaries, targetReviews,
} from "@/lib/reviews/reviews";
import { store } from "@/lib/store";
import type { SearchCriteria } from "@/lib/types";

const rooms = [{ adults: 2, childAges: [] as number[] }];
const criteria: SearchCriteria = {
  origin: "CAI", stays: [{ city: "RUH", nights: 3 }, { city: "JED", nights: 3 }],
  departureDate: "2026-10-10", returnDate: "2026-10-16", rooms, pax: paxFromRooms(rooms), cabin: "economy", nationality: "EG",
};
const at = (local: string) => new Date(`${local}+03:00`);

async function setup(id: string) {
  const user: PublicUser = {
    id: `u-${id}`, email: `${id}@example.com`, accountType: "individual", preferredLocale: "ar", preferredCurrency: "SAR", createdAt: "2026-09-01T00:00:00Z",
    individual: { fullName: "Rahul Kumar Sharma", phone: "+966501234567", nationality: "IN" },
  };
  await store().put("users", user.id, { ...user, passwordHash: "x" });
  const flights = await Promise.all(buildLegs(criteria).map(async (leg) => (await searchFlights({ leg, pax: criteria.pax, cabin: "economy" })).offers[0]));
  const hotels = await Promise.all(stayDates(criteria).map(async (s) => (await searchHotels({ ...s, pax: criteria.pax, rooms })).offers[0]));
  const price = computePackagePrice({ pax: criteria.pax, flights, hotels, activities: [], visaFeeSAR: 402.21 });
  const b = {
    id: `b-${id}`, reference: `TA-${id}`, userId: user.id, accountType: "individual", clientReference: null, createdAt: "2026-09-20T10:00:00Z",
    criteria, flights, hotels, activities: [], price, displayCurrency: "SAR",
    payment: { transactionId: "TXN-1", method: "visa", last4: "1111", amountSAR: price.totalSAR, paidAt: "2026-09-20T10:00:00Z" },
    status: "COMPLETED", mt: { mode: "sandbox", messageId: "m1", packageId: "pkg-1", packageStatus: "COMPLETED", lastCheckedAt: null },
    applicants: [], modifications: [],
  } as StoredBooking;
  await saveBooking(b);
  return { user, b };
}
const real = <T extends { demo?: boolean }>(items: T[]) => items.filter((i) => !i.demo);

afterEach(() => {
  delete process.env.DEMO_REVIEWS;
});

describe("hotels in packages", () => {
  it("are MT-licensed and classified 3 to 5 stars only", () => {
    expect(hotelClassAllowed({ stars: 3, licenseNo: "1" })).toBe(true);
    expect(hotelClassAllowed({ stars: 5, licenseNo: "1" })).toBe(true);
    expect(hotelClassAllowed({ stars: 2, licenseNo: "1" })).toBe(false);
    expect(hotelClassAllowed({ stars: 6, licenseNo: "1" })).toBe(false);
    expect(hotelClassAllowed({ stars: 4.5, licenseNo: "1" })).toBe(false);
    expect(hotelClassAllowed({ stars: 4, licenseNo: "" })).toBe(false);
  });
  it("a sandbox hotel keeps its licence across searches and agents", async () => {
    const a = await searchHotels({ city: "RUH", checkIn: "2026-11-01", checkOut: "2026-11-03", pax: criteria.pax, rooms });
    const b = await searchHotels({ city: "RUH", checkIn: "2026-12-05", checkOut: "2026-12-08", pax: criteria.pax, rooms });
    const lic = (list: typeof a.offers) => new Map(list.map((h) => [h.nameEn, h.licenseNo]));
    const [x, y] = [lic(a.offers), lic(b.offers)];
    const common = [...x.keys()].filter((k) => y.has(k));
    expect(common.length).toBeGreaterThan(0);
    for (const k of common) expect(x.get(k)).toBe(y.get(k));
  });
});

describe("verified reviews", () => {
  it("can be given only for experiences that happened, once each", async () => {
    const { user, b } = await setup("r1");
    const during = real(await pendingReviews(user, at("2026-10-12T12:00:00")));
    // Only the booking service during the trip (hotels checked out, flights landed come later).
    expect(during.map((i) => i.targetType)).toContain("service");
    expect(during.find((i) => i.targetType === "package")).toBeUndefined();
    const after = real(await pendingReviews(user, at("2026-10-17T12:00:00")));
    const types = after.map((i) => i.targetType);
    expect(types).toEqual(expect.arrayContaining(["package", "hotel", "airline", "service"]));
    expect(after.filter((i) => i.targetType === "hotel").map((i) => i.targetId)).toEqual(expect.arrayContaining(b.hotels.map((h) => h.licenseNo)));

    await expect(submitReview(user, { key: "hotel:nope:b-r1", rating: 5 }, at("2026-10-17T12:00:00"))).rejects.toMatchObject({ code: "notEligible" });
    const pkg = after.find((i) => i.targetType === "package")!;
    await expect(submitReview(user, { key: pkg.key, rating: 6 }, at("2026-10-17T12:00:00"))).rejects.toMatchObject({ code: "rating" });
    await expect(submitReview(user, { key: pkg.key, rating: 5, criteria: { food: 5 } }, at("2026-10-17T12:00:00"))).rejects.toMatchObject({ code: "criteria" });
    const ok = await submitReview(user, { key: pkg.key, rating: 5, criteria: { organisation: 5, value: 4 }, comment: "Excellent trip, very well organised." }, at("2026-10-17T12:00:00"));
    expect(ok.review).toMatchObject({ status: "published", authorName: "Rahul S.", authorCountry: "IN", lang: "en" });
    expect(ok.complaint).toBe(false);
    await expect(submitReview(user, { key: pkg.key, rating: 4 }, at("2026-10-17T12:00:00"))).rejects.toMatchObject({ code: "alreadyReviewed" });
    expect(real(await pendingReviews(user, at("2026-10-17T12:00:00"))).find((i) => i.key === pkg.key)).toBeUndefined();
  });

  it("holds personal data and photos for the back office, and offers the complaint service for low ratings", async () => {
    const { user } = await setup("r2");
    const items = real(await pendingReviews(user, at("2026-10-17T12:00:00")));
    const [h1, h2] = items.filter((i) => i.targetType === "hotel");
    const air = items.find((i) => i.targetType === "airline")!;
    const pii = await submitReview(user, { key: h1.key, rating: 2, comment: "Call the manager on 0501234567, room was dirty" }, at("2026-10-17T12:00:00"));
    expect(pii.review).toMatchObject({ status: "pending", moderationReason: "personalData" });
    expect(pii.complaint).toBe(true);
    const pic = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const photo = await submitReview(user, { key: h2.key, rating: 4, comment: "غرفة واسعة", photos: [pic] }, at("2026-10-17T12:00:00"));
    expect(photo.review).toMatchObject({ status: "pending", moderationReason: "photos", lang: "ar" });
    expect(photo.review.photos).toHaveLength(1);
    await expect(submitReview(user, { key: air.key, rating: 4, photos: ["data:text/html;base64,AAAA"] }, at("2026-10-17T12:00:00"))).rejects.toMatchObject({ code: "photos" });

    // Not public until approved; approval and the establishment's reply.
    process.env.DEMO_REVIEWS = "off";
    expect((await targetReviews("hotel", h2.targetId)).reviews).toHaveLength(0);
    expect((await adminReviews("pending")).map((r) => r.id)).toEqual(expect.arrayContaining([pii.review.id, photo.review.id]));
    await adminModerate(photo.review.id, "approve", null);
    await adminModerate(pii.review.id, "reject", "Personal data");
    await adminReply(photo.review.id, "شكرًا لزيارتكم");
    const pub = await targetReviews("hotel", h2.targetId);
    expect(pub.reviews).toHaveLength(1);
    expect(pub.reviews[0].reply).toMatchObject({ text: "شكرًا لزيارتكم", byAr: `إدارة ${h2.nameAr}` });
    expect(pub.summary).toMatchObject({ avg: 4, count: 1 });
    expect((await targetReviews("hotel", h1.targetId)).reviews).toHaveLength(0);
    expect((await myReviews(user.id)).map((r) => r.status).sort()).toEqual(["published", "rejected"]);
  });

  it("asks travellers to rate new experiences once, in the notifications and by email", async () => {
    const { user } = await setup("r3");
    const now = at("2026-10-17T12:00:00");
    expect(await requestReviews(user.id, now)).toBe(true);
    expect(await requestReviews(user.id, now)).toBe(false);
    expect(await requestReviews(user.id, at("2026-10-18T12:00:00"))).toBe(false);
    const n = (await listNotifications(user.id, now)).find((x) => x.kind === "review")!;
    expect(n.titleAr).toBe("قيّم تجربتك مع سعودي تريب");
    expect(n.href).toBe("/account/reviews");
    expect((await listOutbox()).some((m) => m.to.includes("r3@example.com") && m.subject.includes("Rate your experience"))).toBe(true);
  });

  it("shows sample reviews and a sample trip to rate in sandbox mode", async () => {
    const { user } = await setup("r4");
    const s = await summaries("restaurant", ["ruh-najd-heritage", "unknown-id"]);
    expect(s["ruh-najd-heritage"].count).toBeGreaterThanOrEqual(3);
    const svc = await serviceRatings();
    expect(svc.services).toHaveLength(7);
    expect(svc.overall.count).toBeGreaterThan(50);
    const demo = (await pendingReviews(user, at("2026-09-26T12:00:00"))).filter((i) => i.demo);
    expect(demo.map((i) => i.targetType)).toEqual(expect.arrayContaining(["package", "hotel", "airline", "restaurant", "event", "place", "service"]));
    const r = await submitReview(user, { key: demo.find((i) => i.targetType === "airline")!.key, rating: 5 }, at("2026-09-26T12:00:00"));
    expect(r.review.demo).toBe(true);
    process.env.DEMO_REVIEWS = "off";
    expect((await summaries("restaurant", ["ruh-najd-heritage"]))["ruh-najd-heritage"].count).toBe(0);
    expect((await pendingReviews(user, at("2026-09-26T12:00:00"))).some((i) => i.demo)).toBe(false);
  });
});
