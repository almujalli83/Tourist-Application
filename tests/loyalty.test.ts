import { afterEach, describe, expect, it } from "vitest";
import type { PublicUser } from "@/lib/auth/types";
import { cancelOrder, eventsCatalog, openSessions, placeOrder } from "@/lib/events/orders";
import { seedDemoLoyalty } from "@/lib/loyalty/demo";
import {
  adminAdjust, awardPurchase, awardReviewBonus, createCampaign, ensureAccount, expiryReminders, getAccount, holdRedeem, joinWithReferral,
  loyaltyOverview, loyaltySummary, memberDetails, packageAvailableAt, redeemedOn, releaseRedeem, returnRedeemed, reversePurchase, runLoyalty, updateCampaign,
} from "@/lib/loyalty/loyalty";
import { earnPoints, maxRedeemable, pointsValueSAR, redeemError, tierFor } from "@/lib/loyalty/rules";
import { listNotifications } from "@/lib/reminders/reminders";
import { createUser } from "@/lib/repo";

const run = Math.random().toString(36).slice(2, 8);
const card = { holder: "Test User", number: "4111111111111111", expMonth: "12", expYear: "30", cvc: "123" };
const at = (iso: string) => new Date(iso);
const DAY = 86_400_000;

async function member(id: string, accountType: "individual" | "company" = "individual"): Promise<PublicUser> {
  const u: PublicUser = {
    id: `${id}-${run}`, email: `${id}-${run}@example.com`, accountType, preferredLocale: "ar", preferredCurrency: "SAR", createdAt: "2026-01-01T00:00:00Z",
    ...(accountType === "individual" ? { individual: { fullName: "Sara Ali", phone: "+966500000000", nationality: "EG" } } : { company: { companyName: "Agency", commercialRegNo: "1", tourismLicenseNo: "1", vatNo: "", contactPerson: "A", phone: "+966500000000", city: "RUH" } }),
  };
  await createUser({ ...u, passwordHash: "x" } as never);
  return u;
}

const earn = (u: PublicUser, id: string, sar: number, availableAt: string, now: Date, service: "package" | "event" | "train" | "esim" = "event", cities?: string[]) =>
  awardPurchase(u, { service, source: { kind: service, id, reference: id }, eligibleSAR: sar, availableAt, cities }, now);

afterEach(() => {
  delete process.env.DEMO_LOYALTY;
});

describe("loyalty rules", () => {
  it("earns per riyal by service, tier and campaign", () => {
    expect(earnPoints({ service: "package", eligibleSAR: 1000 })).toBe(2000);
    expect(earnPoints({ service: "event", eligibleSAR: 99.99 })).toBe(99);
    expect(earnPoints({ service: "train", eligibleSAR: 100, tierMultiplier: 1.25, campaignMultiplier: 2 })).toBe(250);
    expect(earnPoints({ service: "esim", eligibleSAR: 0 })).toBe(0);
    expect(tierFor(0).tier.id).toBe("silver");
    expect(tierFor(15_000).tier.id).toBe("gold");
    expect(tierFor(39_999).toNextSAR).toBe(1);
    expect(tierFor(50_000).next).toBeNull();
  });

  it("limits redemption to 30%, from 500 points, and keeps 2,000 SAR per adult paid on packages", () => {
    expect(pointsValueSAR(100)).toBe(5);
    expect(maxRedeemable({ totalSAR: 1000, balance: 10_000 })).toBe(6000); // 300 SAR
    expect(maxRedeemable({ totalSAR: 1000, balance: 700 })).toBe(700);
    expect(maxRedeemable({ totalSAR: 1000, balance: 400 })).toBe(0);
    expect(maxRedeemable({ totalSAR: 50, balance: 10_000 })).toBe(0); // 30% is 15 SAR = 300 points < 500
    // Two adults: 4,000 SAR must stay paid, so only 200 SAR of a 4,200 SAR package.
    expect(maxRedeemable({ totalSAR: 4200, balance: 100_000, floorSAR: 4000 })).toBe(4000);
    expect(maxRedeemable({ totalSAR: 4010, balance: 100_000, floorSAR: 4000 })).toBe(0);
    expect(redeemError(499, { totalSAR: 1000, balance: 5000 })).toBe("redeemBelowMinimum");
    expect(redeemError(6001, { totalSAR: 1000, balance: 10_000 })).toBe("redeemAboveMaximum");
    expect(redeemError(800, { totalSAR: 1000, balance: 700 })).toBe("redeemBalance");
    expect(redeemError(1.5, { totalSAR: 1000, balance: 700 })).toBe("redeemInvalid");
    expect(redeemError(0, { totalSAR: 1000, balance: 0 })).toBeNull();
  });
});

describe("points ledger", () => {
  it("keeps purchase points pending until the service is over, once per purchase", async () => {
    const u = await member("pend");
    const now = at("2026-10-01T10:00:00Z");
    expect(await earn(u, `ev-${run}`, 300, "2026-10-05T20:00:00Z", now)).toBe(300);
    expect(await earn(u, `ev-${run}`, 300, "2026-10-05T20:00:00Z", now)).toBe(300); // same purchase again: not added twice
    let s = (await loyaltySummary(u, now)).summary;
    expect([s.available, s.pending, s.lifetimeEarned]).toEqual([0, 300, 300]);
    s = (await loyaltySummary(u, at("2026-10-06T00:00:00Z"))).summary;
    expect([s.available, s.pending]).toEqual([300, 0]);
    // Package points: the day after the return date, Saudi time.
    expect(packageAvailableAt("2026-10-16")).toBe("2026-10-16T21:00:00.000Z");
  });

  it("holds points before payment, releases them if the payment fails, and returns them on cancellation", async () => {
    const u = await member("redeem");
    const now = at("2026-10-01T10:00:00Z");
    await earn(u, `a-${run}`, 2000, now.toISOString(), now);
    const hold = await holdRedeem(u, { points: 1000, totalSAR: 500, source: { kind: "event", id: `o-${run}` } }, now);
    expect(hold).toMatchObject({ points: 1000, discountSAR: 50 });
    expect((await loyaltySummary(u, now)).summary.available).toBe(1000);
    await releaseRedeem(u.id, hold, now);
    expect((await loyaltySummary(u, now)).summary.available).toBe(2000);
    await expect(holdRedeem(u, { points: 3000, totalSAR: 5000, source: { kind: "event", id: "x" } }, now)).rejects.toMatchObject({ code: "redeemBalance" });
    await expect(holdRedeem(u, { points: 1000, totalSAR: 100, source: { kind: "event", id: "x" } }, now)).rejects.toMatchObject({ code: "redeemAboveMaximum" });
    // Packages: 2,000 SAR per adult stays paid (one adult, 2,010 SAR package → at most 10 SAR).
    await expect(holdRedeem(u, { points: 500, totalSAR: 2010, floorSAR: 2000, source: { kind: "package", id: "x" } }, now)).rejects.toMatchObject({ code: "redeemAboveMaximum" });

    await holdRedeem(u, { points: 600, totalSAR: 500, source: { kind: "event", id: `o2-${run}` } }, now);
    expect(redeemedOn(await getAccount(u.id), `o2-${run}`)).toEqual({ points: 600, discountSAR: 30 });
    const later = new Date(now.getTime() + 10 * DAY);
    expect(await returnRedeemed(u.id, `o2-${run}`, later)).toBe(600);
    expect(await returnRedeemed(u.id, `o2-${run}`, later)).toBe(0); // only once
    const acc = await getAccount(u.id);
    const back = acc!.entries.find((e) => e.type === "return")!;
    expect(back.expiresAt! >= new Date(later.getTime() + 90 * DAY).toISOString()).toBe(true);
    expect((await loyaltySummary(u, later)).summary.available).toBe(2000);
  });

  it("takes back earned points in proportion to a refund, owing what was already used", async () => {
    const u = await member("rev");
    const now = at("2026-10-01T10:00:00Z");
    await earn(u, `p-${run}`, 1000, now.toISOString(), now);
    expect(await reversePurchase(u.id, [`p-${run}`], 0.25, now)).toBe(250);
    expect((await loyaltySummary(u, now)).summary.available).toBe(750);
    await holdRedeem(u, { points: 700, totalSAR: 5000, source: { kind: "event", id: `spent-${run}` } }, now);
    expect(await reversePurchase(u.id, [`p-${run}`], 1, now)).toBe(750); // the rest of the 1,000
    let s = (await loyaltySummary(u, now)).summary;
    expect([s.available, s.deficit]).toEqual([0, 700]);
    expect(s.spend12mSAR).toBe(0);
    // The next points pay the deficit first.
    await earn(u, `q-${run}`, 1000, now.toISOString(), now);
    s = (await loyaltySummary(u, now)).summary;
    expect([s.available, s.deficit]).toEqual([300, 0]);
  });

  it("expires points after 24 months with one reminder 30 days before", async () => {
    const u = await member("exp");
    const earned = at("2026-01-10T10:00:00Z");
    await earn(u, `e-${run}`, 400, earned.toISOString(), earned);
    const soon = at("2027-12-20T10:00:00Z");
    expect(await expiryReminders(u.id, soon)).toBe(1);
    expect(await expiryReminders(u.id, soon)).toBe(0);
    const n = (await listNotifications(u.id, soon)).find((x) => x.kind === "points")!;
    expect(n.titleEn).toContain("400 points expire");
    expect(n.href).toBe("/account/loyalty");
    const after = at("2028-01-11T00:00:00Z");
    await runLoyalty(after);
    const s = (await loyaltySummary(u, after)).summary;
    expect(s.available).toBe(0);
    expect((await getAccount(u.id))!.entries.some((e) => e.type === "expire" && e.points === -400)).toBe(true);
  });

  it("raises the tier with 12-month spend and applies campaigns", async () => {
    const admin = await member("camp-admin");
    const u = await member("tier");
    const now = at("2026-11-01T10:00:00Z");
    await earn(u, `big-${run}`, 16_000, now.toISOString(), now, "train");
    expect((await loyaltySummary(u, now)).summary.tier.id).toBe("gold");
    expect(await earn(u, `t2-${run}`, 100, now.toISOString(), now, "train")).toBe(125);
    const c = await createCampaign(admin, { nameAr: "موسم الرياض", nameEn: "Riyadh Season", from: "2026-11-01", to: "2026-11-30", multiplier: 2, services: ["event"], cities: ["RUH"] }, now);
    expect(await earn(u, `t3-${run}`, 100, now.toISOString(), now, "event", ["RUH"])).toBe(250);
    expect(await earn(u, `t4-${run}`, 100, now.toISOString(), now, "event", ["JED"])).toBe(125);
    await updateCampaign(c.id, { active: false });
    expect(await earn(u, `t5-${run}`, 100, now.toISOString(), now, "event", ["RUH"])).toBe(125);
    await expect(createCampaign(admin, { nameAr: "x", nameEn: "x", from: "2026-11-02", to: "2026-11-01", multiplier: 2 })).rejects.toMatchObject({ code: "campaignDates" });
    // A year later the spend no longer counts.
    expect((await loyaltySummary(u, at("2027-11-02T10:00:00Z"))).summary.tier.id).toBe("silver");
  });

  it("rewards both members on the invited member's first paid purchase", async () => {
    const inviter = await member("inviter");
    const friend = await member("friend");
    const now = at("2026-10-01T10:00:00Z");
    const code = (await ensureAccount(inviter.id)).referralCode;
    expect(await joinWithReferral(inviter, code)).toBe(false); // own code
    expect(await joinWithReferral(friend, "NOPE")).toBe(false);
    expect(await joinWithReferral(friend, code.toLowerCase())).toBe(true);
    await earn(friend, `f1-${run}`, 100, now.toISOString(), now);
    await earn(friend, `f2-${run}`, 100, now.toISOString(), now);
    expect((await loyaltySummary(friend, now)).summary.available).toBe(200 + 250);
    expect((await loyaltySummary(inviter, now)).summary.available).toBe(500);
  });

  it("gives review bonuses once, and leaves company accounts out", async () => {
    const u = await member("rv");
    expect(await awardReviewBonus(u.id, `r-${run}`)).toBe(50);
    expect(await awardReviewBonus(u.id, `r-${run}`)).toBe(0);
    const co = await member("co", "company");
    expect(await awardReviewBonus(co.id, `r2-${run}`)).toBe(0);
    expect(await earn(co, `c-${run}`, 1000, new Date().toISOString(), new Date())).toBe(0);
    await expect(holdRedeem(co, { points: 500, totalSAR: 1000, source: { kind: "event", id: "x" } })).rejects.toMatchObject({ code: "notEligible" });
    expect((await loyaltySummary(co)).summary.eligible).toBe(false);
  });
});

describe("back office", () => {
  it("adjusts points with a reason and reports the outstanding liability", async () => {
    const admin = { ...(await member("boss")), isAdmin: true };
    const u = await member("adj");
    await expect(adminAdjust(admin, u.email, 100, "")).rejects.toMatchObject({ code: "adjustReason" });
    await expect(adminAdjust(admin, u.email, 0, "goodwill")).rejects.toMatchObject({ code: "adjustPoints" });
    await expect(adminAdjust(admin, "nobody@example.com", 10, "goodwill")).rejects.toMatchObject({ code: "memberNotFound" });
    const d = await adminAdjust(admin, u.email, 1000, "Delayed flight goodwill");
    expect(d?.summary.available).toBe(1000);
    await expect(adminAdjust(admin, u.email, -2000, "correction")).rejects.toMatchObject({ code: "insufficientPoints" });
    await adminAdjust(admin, u.email, -400, "correction");
    expect((await memberDetails(u.email))?.summary.available).toBe(600);
    const o = await loyaltyOverview();
    expect(o.adjustments.some((a) => a.email === u.email && a.points === 1000 && a.by === admin.email && a.note === "Delayed flight goodwill")).toBe(true);
    expect(o.liabilitySAR).toBe(pointsValueSAR(o.available + o.pending));
  });
});

describe("purchases", () => {
  it("pays part of an event order with points, earns on the card amount and gives points back on cancellation", async () => {
    const u = await member("buyer");
    const e = (await eventsCatalog()).find((x) => x.id === "ruh-boulevard-entry")!;
    const session = openSessions(e)[2];
    const now = new Date();
    await earn(u, `seed-${run}`, 1000, now.toISOString(), now);
    const quantities = { adult: 5 };
    const price = e.ticketTypes!.find((t) => t.id === "adult")!.priceSAR * 5;
    expect(price).toBeGreaterThan(84);
    const max = maxRedeemable({ totalSAR: price, balance: 1000 });
    const order = await placeOrder(u, { eventId: e.id, sessionId: session.id, quantities, expectedTotalSAR: price, idempotencyKey: `pts-${run}`, card, redeemPoints: max });
    expect(order.totalSAR).toBe(price);
    expect(order.payment.amountSAR).toBe(Math.round((price - pointsValueSAR(max)) * 100) / 100);
    expect(order.loyalty).toMatchObject({ redeemedPoints: max, discountSAR: pointsValueSAR(max), earnedPoints: Math.floor(order.payment.amountSAR) });
    let s = (await loyaltySummary(u)).summary;
    expect(s.available).toBe(1000 - max);
    expect(s.pending).toBe(order.loyalty!.earnedPoints);

    // Too many points: refused before the card is charged.
    await expect(placeOrder(u, { eventId: e.id, sessionId: session.id, quantities, expectedTotalSAR: price, idempotencyKey: `pts2-${run}`, card, redeemPoints: 100_000 })).rejects.toMatchObject({ code: "redeemBalance" });

    if (e.refund.refundable) {
      const cancelled = await cancelOrder(u, order.id);
      expect(cancelled.cancellation?.refundSAR).toBe(order.payment.amountSAR);
      s = (await loyaltySummary(u)).summary;
      expect([s.available, s.pending]).toEqual([1000, 0]);
    }
  });
});

describe("sandbox samples", () => {
  it("adds sample points once for individual members (DEMO_LOYALTY=off disables them)", async () => {
    process.env.DEMO_LOYALTY = "off";
    const off = await member("demo-off");
    await seedDemoLoyalty(off);
    expect((await getAccount(off.id))?.entries ?? []).toHaveLength(0);
    delete process.env.DEMO_LOYALTY;
    const u = await member("demo");
    await seedDemoLoyalty(u);
    await seedDemoLoyalty(u);
    const { summary, entries } = await loyaltySummary(u);
    expect(entries.every((e) => e.demo)).toBe(true);
    expect(entries).toHaveLength(5);
    expect(summary).toMatchObject({ available: 2250, pending: 180, demo: true });
    expect(summary.expiring?.points).toBe(300);
    const co = await member("demo-co", "company");
    await seedDemoLoyalty(co);
    expect(await getAccount(co.id)).toBeNull();
  });
});
