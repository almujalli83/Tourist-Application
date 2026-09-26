/**
 * Loyalty programme (service 10): individual accounts earn points on what they pay by card for
 * packages, event tickets, train tickets and eSIMs (visa & insurance fees excluded), plus bonuses
 * for verified reviews and referrals. Purchase points are pending until the trip or service is
 * over, expire after 24 months, and pay up to 30% of event or train tickets (100 points = 5 SAR,
 * from 500 points; packages are never discounted). Tiers by 12-month spend multiply purchase points; campaigns set by the back office too.
 *
 * Each member has one ledger document (collection "loyalty", id = user id), changed atomically.
 */
import { randomInt, randomUUID } from "node:crypto";
import type { PublicUser } from "../auth/types";
import { addDays } from "../dates";
import { notifyTravellers } from "../notify";
import type { AppNotification } from "../reminders/reminders";
import { getUserByEmail, getUserById } from "../repo";
import { store } from "../store";
import { bestCampaign, canRedeemOn, earnPoints, expiryFrom, LOYALTY, pointsValueSAR, redeemError, tierFor, type EarnService } from "./rules";
import type { LoyaltyAccount, LoyaltyCampaign, LoyaltyEntry, LoyaltySource, LoyaltySummary } from "./types";
export type { OrderLoyalty } from "./types";

const COL = "loyalty" as const;
const CAMPAIGNS = "loyaltyCampaigns" as const;
const DAY = 86_400_000;

export class LoyaltyError extends Error {
  constructor(public code: string, public status = 422) {
    super(code);
  }
}

type Member = Pick<PublicUser, "id" | "accountType">;
export const isEligible = (u: Pick<PublicUser, "accountType"> | null | undefined) => u?.accountType === "individual";

const iso = (d: Date) => d.toISOString();
export const ksaDate = (d: Date) => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
/** Start of a Saudi calendar day, as an ISO instant. */
export const ksaDayStart = (date: string) => new Date(`${date}T00:00:00+03:00`).toISOString();
/** Package points become usable the day after the return date. */
export const packageAvailableAt = (returnDate: string) => ksaDayStart(addDays(returnDate, 1));

/* ------------------------------------------------------------ ledger (pure) */

const isLot = (e: LoyaltyEntry) => e.remaining !== undefined;
const usable = (e: LoyaltyEntry, now: string) => isLot(e) && e.availableAt! <= now && e.expiresAt! > now;
const waiting = (e: LoyaltyEntry, now: string) => isLot(e) && e.availableAt! > now && e.expiresAt! > now;
const byExpiry = (a: LoyaltyEntry, b: LoyaltyEntry) => a.expiresAt!.localeCompare(b.expiresAt!) || a.at.localeCompare(b.at);

/** Marks lots past their expiry date as expired. */
export function sweep(acc: LoyaltyAccount, now: Date): LoyaltyAccount {
  const n = iso(now);
  for (const lot of acc.entries.filter((e) => isLot(e) && e.remaining! > 0 && e.expiresAt! <= n)) {
    acc.entries.push({ id: randomUUID(), at: lot.expiresAt!, type: "expire", points: -lot.remaining!, from: [{ lot: lot.id, points: lot.remaining! }], ...(lot.demo ? { demo: true } : {}) });
    lot.remaining = 0;
  }
  return acc;
}

/** Adds a credit lot; points owed after an earlier reversal are taken from it first. */
function credit(acc: LoyaltyAccount, e: Omit<LoyaltyEntry, "remaining">): LoyaltyEntry {
  const paid = Math.min(acc.deficit, e.points);
  acc.deficit -= paid;
  const entry = { ...e, remaining: e.points - paid };
  acc.entries.push(entry);
  return entry;
}

/** Takes points from lots (preferred lots first, then by expiry); returns what was taken and what was missing. */
function take(acc: LoyaltyAccount, points: number, now: Date, opts: { pending?: boolean; prefer?: string[] } = {}) {
  const n = iso(now);
  const lots = acc.entries.filter((e) => (usable(e, n) || (opts.pending && waiting(e, n))) && e.remaining! > 0);
  const prefer = new Set(opts.prefer ?? []);
  lots.sort((a, b) => Number(prefer.has(b.id)) - Number(prefer.has(a.id)) || Number(waiting(a, n)) - Number(waiting(b, n)) || byExpiry(a, b));
  const from: { lot: string; points: number }[] = [];
  let left = points;
  for (const lot of lots) {
    if (!left) break;
    const p = Math.min(left, lot.remaining!);
    lot.remaining! -= p;
    left -= p;
    from.push({ lot: lot.id, points: p });
  }
  return { from, missing: left };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function spend12m(acc: LoyaltyAccount, now: Date): number {
  const since = iso(new Date(now.getTime() - LOYALTY.tierWindowDays * DAY));
  return round2(Math.max(0, sum(acc.entries.filter((e) => e.spendSAR && e.at >= since).map((e) => e.spendSAR!))));
}

export function summarize(acc: LoyaltyAccount | null, now: Date, campaigns: LoyaltyCampaign[] = [], eligible = true): LoyaltySummary {
  const n = iso(now);
  const entries = acc?.entries ?? [];
  const spend = acc ? spend12m(acc, now) : 0;
  const t = tierFor(spend);
  const horizon = iso(new Date(now.getTime() + 90 * DAY));
  const soon = entries.filter((e) => (usable(e, n) || waiting(e, n)) && e.remaining! > 0 && e.expiresAt! <= horizon).sort(byExpiry);
  const firstDate = soon[0] ? ksaDate(new Date(soon[0].expiresAt!)) : null;
  const today = ksaDate(now);
  return {
    eligible,
    available: sum(entries.filter((e) => usable(e, n)).map((e) => e.remaining!)),
    pending: sum(entries.filter((e) => waiting(e, n)).map((e) => e.remaining!)),
    deficit: acc?.deficit ?? 0,
    lifetimeEarned: sum(entries.filter((e) => e.type === "earn" || e.type === "bonus" || (e.type === "adjust" && e.points > 0)).map((e) => e.points)),
    tier: { id: t.tier.id, multiplier: t.tier.multiplier },
    next: t.next ? { id: t.next.id, minSpendSAR: t.next.minSpendSAR } : null,
    spend12mSAR: spend,
    toNextSAR: t.toNextSAR,
    expiring: firstDate ? { date: firstDate, points: sum(soon.filter((e) => ksaDate(new Date(e.expiresAt!)) === firstDate).map((e) => e.remaining!)) } : null,
    referralCode: acc?.referralCode ?? null,
    campaigns: campaigns
      .filter((c) => c.active && c.from <= today && c.to >= today)
      .map((c) => ({ id: c.id, nameAr: c.nameAr, nameEn: c.nameEn, multiplier: c.multiplier, services: c.services, cities: c.cities, to: c.to })),
    demo: entries.some((e) => e.demo),
  };
}

/* ------------------------------------------------------------ accounts */

function newCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return `ST${Array.from({ length: 6 }, () => alphabet[randomInt(0, alphabet.length)]).join("")}`;
}

export function getAccount(userId: string) {
  return store().get<LoyaltyAccount>(COL, userId);
}

/** The member's ledger, created on first use with a unique referral code. */
export async function ensureAccount(userId: string, now = new Date()): Promise<LoyaltyAccount> {
  const existing = await getAccount(userId);
  if (existing) return existing;
  let code = newCode();
  while ((await store().findBy(COL, "referralCode", code)).length) code = newCode();
  const acc: LoyaltyAccount = { id: userId, userId, referralCode: code, referredBy: null, referralRewarded: false, createdAt: iso(now), entries: [], deficit: 0, notified: [] };
  await store().insert(COL, userId, acc);
  return (await getAccount(userId))!;
}

/** Atomic change of a member's ledger (expired lots are swept first). */
async function change<T>(userId: string, now: Date, fn: (acc: LoyaltyAccount) => T): Promise<{ acc: LoyaltyAccount; result: T }> {
  await ensureAccount(userId, now);
  let result!: T;
  const acc = await store().update<LoyaltyAccount>(COL, userId, (doc) => {
    const next = sweep(structuredClone(doc), now);
    result = fn(next);
    return next;
  });
  return { acc: acc!, result };
}

export async function loyaltySummary(user: Member, now = new Date()): Promise<{ summary: LoyaltySummary; entries: LoyaltyEntry[] }> {
  const campaigns = await listCampaigns();
  if (!isEligible(user)) return { summary: summarize(null, now, campaigns, false), entries: [] };
  const { acc } = await change(user.id, now, () => null);
  const entries = [...acc.entries].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200);
  return { summary: summarize(acc, now, campaigns), entries };
}

/** Available points (0 for accounts outside the programme). */
export async function availablePoints(user: Member, now = new Date()): Promise<number> {
  if (!isEligible(user)) return 0;
  const acc = await getAccount(user.id);
  return acc ? summarize(sweep(structuredClone(acc), now), now).available : 0;
}

/* ------------------------------------------------------------ referrals */

/** Links a new member to the member whose referral code they used (at registration). */
export async function joinWithReferral(user: Member, code: string | undefined, now = new Date()): Promise<boolean> {
  const clean = code?.trim().toUpperCase();
  if (!clean || !isEligible(user)) return false;
  const [referrer] = await store().findBy<LoyaltyAccount>(COL, "referralCode", clean);
  if (!referrer || referrer.userId === user.id) return false;
  const { result } = await change(user.id, now, (acc) => {
    if (acc.referredBy || acc.entries.some((e) => e.type === "earn")) return false;
    acc.referredBy = referrer.userId;
    return true;
  });
  return result;
}

/* ------------------------------------------------------------ campaigns */

export async function listCampaigns(): Promise<LoyaltyCampaign[]> {
  return (await store().list<LoyaltyCampaign>(CAMPAIGNS, 500)).sort((a, b) => b.from.localeCompare(a.from));
}

/** Highest multiplier of the campaigns covering this purchase (1 when none). */
export function campaignMultiplier(campaigns: LoyaltyCampaign[], service: EarnService, at: Date, cities: string[] = []) {
  const day = ksaDate(at);
  const best = bestCampaign(campaigns.filter((c) => c.active && c.from <= day && c.to >= day), service, cities);
  return { multiplier: best?.multiplier ?? 1, campaignId: best?.id };
}

export function validateCampaign(input: Partial<LoyaltyCampaign>): Omit<LoyaltyCampaign, "id" | "createdAt" | "createdBy"> {
  const date = /^\d{4}-\d{2}-\d{2}$/;
  const nameAr = String(input.nameAr ?? "").trim().slice(0, 80);
  const nameEn = String(input.nameEn ?? "").trim().slice(0, 80);
  const multiplier = Number(input.multiplier);
  const services = (Array.isArray(input.services) ? input.services : []).filter((s): s is EarnService => s in LOYALTY.pointsPerSAR);
  const cities = (Array.isArray(input.cities) ? input.cities : []).map((c) => String(c).trim().toUpperCase()).filter((c) => /^[A-Z]{3}$/.test(c));
  if (!nameAr || !nameEn) throw new LoyaltyError("campaignName", 400);
  if (!date.test(String(input.from)) || !date.test(String(input.to)) || input.from! > input.to!) throw new LoyaltyError("campaignDates", 400);
  if (!(multiplier > 1 && multiplier <= 5)) throw new LoyaltyError("campaignMultiplier", 400);
  return { nameAr, nameEn, from: input.from!, to: input.to!, multiplier: Math.round(multiplier * 100) / 100, services: [...new Set(services)], cities: [...new Set(cities)], active: input.active !== false };
}

export async function createCampaign(admin: PublicUser, input: Partial<LoyaltyCampaign>, now = new Date()): Promise<LoyaltyCampaign> {
  const c: LoyaltyCampaign = { id: randomUUID(), ...validateCampaign(input), createdAt: iso(now), createdBy: admin.email };
  await store().put(CAMPAIGNS, c.id, c);
  return c;
}

export async function updateCampaign(id: string, input: Partial<LoyaltyCampaign>): Promise<LoyaltyCampaign | null> {
  const cur = await store().get<LoyaltyCampaign>(CAMPAIGNS, id);
  if (!cur) return null;
  const next = { ...cur, ...validateCampaign({ ...cur, ...input }) };
  await store().put(CAMPAIGNS, id, next);
  return next;
}

export const deleteCampaign = (id: string) => store().delete(CAMPAIGNS, id);

/* ------------------------------------------------------------ earning */

export interface PurchaseAward {
  service: EarnService;
  source: LoyaltySource;
  /** Paid by card, without government fees (and after the points discount). */
  eligibleSAR: number;
  /** When the points can be used (after the trip or service). */
  availableAt: string;
  /** Destinations, for city campaigns. */
  cities?: string[];
}

/** Points for a paid purchase (once per source); returns the points credited. */
export async function awardPurchase(user: Member, input: PurchaseAward, now = new Date()): Promise<number> {
  if (!isEligible(user) || !(input.eligibleSAR > 0)) return 0;
  const campaign = campaignMultiplier(await listCampaigns(), input.service, now, input.cities);
  let referrer: string | null = null;
  const { result } = await change(user.id, now, (acc) => {
    const done = acc.entries.find((e) => e.type === "earn" && e.source?.kind === input.source.kind && e.source.id === input.source.id);
    if (done) return done.points;
    const tier = tierFor(spend12m(acc, now)).tier.multiplier;
    const points = earnPoints({ service: input.service, eligibleSAR: input.eligibleSAR, tierMultiplier: tier, campaignMultiplier: campaign.multiplier });
    const availableAt = input.availableAt < iso(now) ? iso(now) : input.availableAt;
    credit(acc, {
      id: randomUUID(), at: iso(now), type: "earn", points, source: input.source, availableAt, expiresAt: expiryFrom(iso(now)),
      spendSAR: round2(input.eligibleSAR), multiplier: { tier, campaign: campaign.multiplier, ...(campaign.campaignId ? { campaignId: campaign.campaignId } : {}) },
    });
    // Referral: both members are rewarded on the new member's first paid purchase.
    if (acc.referredBy && !acc.referralRewarded) {
      acc.referralRewarded = true;
      referrer = acc.referredBy;
      credit(acc, { id: randomUUID(), at: iso(now), type: "bonus", points: LOYALTY.refereeBonus, source: { kind: "welcome", id: `welcome:${user.id}` }, availableAt, expiresAt: expiryFrom(iso(now)) });
    }
    return points;
  });
  if (referrer) await awardBonus(referrer, { kind: "referral", id: `invite:${user.id}` }, LOYALTY.referrerBonus, now, input.availableAt);
  return result;
}

async function awardBonus(userId: string, source: LoyaltySource, points: number, now: Date, availableAt = iso(now)): Promise<number> {
  const { result } = await change(userId, now, (acc) => {
    if (acc.entries.some((e) => e.type === "bonus" && e.source?.id === source.id)) return 0;
    credit(acc, { id: randomUUID(), at: iso(now), type: "bonus", points, source, availableAt: availableAt < iso(now) ? iso(now) : availableAt, expiresAt: expiryFrom(iso(now)) });
    return points;
  });
  return result;
}

/** Bonus for a published verified review (once per review). */
export async function awardReviewBonus(userId: string, reviewId: string, now = new Date()): Promise<number> {
  const user = await getUserById(userId);
  if (!isEligible(user)) return 0;
  return awardBonus(userId, { kind: "review", id: reviewId }, LOYALTY.reviewBonus, now);
}

/**
 * Takes back points earned on these purchases after a (partial) refund: `share` of what they
 * earned, less what was already taken back. Points already used are owed and taken from the
 * next points earned.
 */
export async function reversePurchase(userId: string, sourceIds: string[], share: number, now = new Date()): Promise<number> {
  if (!(share > 0) || !(await getAccount(userId))) return 0;
  const { result } = await change(userId, now, (acc) => {
    let total = 0;
    for (const sid of sourceIds) {
      const earned = acc.entries.filter((e) => e.type === "earn" && e.source?.id === sid);
      if (!earned.length) continue;
      const reversed = acc.entries.filter((e) => e.type === "reverse" && e.source?.id === sid);
      const earnedPts = sum(earned.map((e) => e.points));
      const points = Math.min(Math.round(earnedPts * Math.min(1, share)), earnedPts + sum(reversed.map((e) => e.points)));
      if (points <= 0) continue;
      const spend = round2(sum(earned.map((e) => e.spendSAR ?? 0)) * Math.min(1, share));
      const { from, missing } = take(acc, points, now, { pending: true, prefer: earned.map((e) => e.id) });
      acc.deficit += missing;
      acc.entries.push({ id: randomUUID(), at: iso(now), type: "reverse", points: -points, source: earned[0].source, from, spendSAR: -spend });
      total += points;
    }
    return total;
  });
  return result;
}

/* ------------------------------------------------------------ redeeming */

export interface RedeemHold {
  entryId: string;
  points: number;
  discountSAR: number;
}

/**
 * Takes the points used on a purchase (event or train tickets) before the card is charged.
 * Release the hold if the purchase fails.
 */
export async function holdRedeem(
  user: Member,
  input: { points: number | undefined; totalSAR: number; source: LoyaltySource },
  now = new Date(),
): Promise<RedeemHold | null> {
  const points = Number(input.points ?? 0);
  if (!points) return null;
  if (!isEligible(user)) throw new LoyaltyError("notEligible");
  if (!canRedeemOn(input.source.kind)) throw new LoyaltyError("redeemNotAllowed");
  const { result } = await change(user.id, now, (acc): RedeemHold | string => {
    const balance = summarize(acc, now).available;
    const err = redeemError(points, { totalSAR: input.totalSAR, balance });
    if (err) return err;
    const { from } = take(acc, points, now);
    const entry: LoyaltyEntry = { id: randomUUID(), at: iso(now), type: "redeem", points: -points, source: input.source, discountSAR: pointsValueSAR(points), from };
    acc.entries.push(entry);
    return { entryId: entry.id, points, discountSAR: entry.discountSAR! };
  });
  if (typeof result === "string") throw new LoyaltyError(result);
  return result;
}

/** Undoes a hold whose purchase did not go through (the points go back to their lots). */
export async function releaseRedeem(userId: string, hold: RedeemHold | null, now = new Date()): Promise<void> {
  if (!hold) return;
  await change(userId, now, (acc) => {
    const e = acc.entries.find((x) => x.id === hold.entryId && x.type === "redeem");
    if (!e) return;
    for (const f of e.from ?? []) {
      const lot = acc.entries.find((x) => x.id === f.lot);
      if (lot) lot.remaining = (lot.remaining ?? 0) + f.points;
    }
    acc.entries = acc.entries.filter((x) => x !== e);
  });
}

/**
 * Gives back points used on a purchase that was cancelled (in full), or up to `maxPoints`.
 * They stay valid until the original expiry, and at least 90 days.
 */
export async function returnRedeemed(userId: string, sourceId: string, now = new Date(), maxPoints = Infinity): Promise<number> {
  if (!(await getAccount(userId))) return 0;
  const { result } = await change(userId, now, (acc) => {
    const redeems = acc.entries.filter((e) => e.type === "redeem" && e.source?.id === sourceId);
    if (!redeems.length) return 0;
    const returned = sum(acc.entries.filter((e) => e.type === "return" && e.source?.id === sourceId).map((e) => e.points));
    const points = Math.min(maxPoints, -sum(redeems.map((e) => e.points)) - returned);
    if (points <= 0) return 0;
    const lots = redeems.flatMap((r) => r.from ?? []).map((f) => acc.entries.find((x) => x.id === f.lot)?.expiresAt).filter(Boolean) as string[];
    const minExpiry = iso(new Date(now.getTime() + LOYALTY.returnedValidityDays * DAY));
    const expiresAt = [minExpiry, ...lots].sort().at(-1)!;
    credit(acc, { id: randomUUID(), at: iso(now), type: "return", points, source: redeems[0].source, availableAt: iso(now), expiresAt });
    return points;
  });
  return result;
}

/** Points used on a purchase and not given back yet, with their value. */
export function redeemedOn(acc: LoyaltyAccount | null, sourceId: string): { points: number; discountSAR: number } {
  if (!acc) return { points: 0, discountSAR: 0 };
  const redeemed = -sum(acc.entries.filter((e) => e.type === "redeem" && e.source?.id === sourceId).map((e) => e.points));
  const returned = sum(acc.entries.filter((e) => e.type === "return" && e.source?.id === sourceId).map((e) => e.points));
  const points = Math.max(0, redeemed - returned);
  return { points, discountSAR: pointsValueSAR(points) };
}

/* ------------------------------------------------------------ back office */

/** Manual credit (+) or debit (−) with a reason; recorded with the back-office user. */
export async function adminAdjust(admin: PublicUser, email: string, points: number, note: string, now = new Date()) {
  const user = await getUserByEmail(email.trim().toLowerCase());
  if (!user) throw new LoyaltyError("memberNotFound", 404);
  if (!isEligible(user)) throw new LoyaltyError("notEligible");
  if (!Number.isInteger(points) || points === 0 || Math.abs(points) > 1_000_000) throw new LoyaltyError("adjustPoints", 400);
  const reason = note.trim().slice(0, 300);
  if (reason.length < 3) throw new LoyaltyError("adjustReason", 400);
  const { result } = await change(user.id, now, (acc) => {
    const base = { id: randomUUID(), at: iso(now), type: "adjust" as const, points, source: { kind: "admin" as const, id: randomUUID() }, note: reason, by: admin.email };
    if (points > 0) {
      credit(acc, { ...base, availableAt: iso(now), expiresAt: expiryFrom(iso(now)) });
      return true;
    }
    const s = summarize(acc, now);
    if (-points > s.available + s.pending) return false;
    const { from } = take(acc, -points, now, { pending: true });
    acc.entries.push({ ...base, from });
    return true;
  });
  if (!result) throw new LoyaltyError("insufficientPoints");
  return memberDetails(email);
}

export async function memberDetails(email: string, now = new Date()) {
  const user = await getUserByEmail(email.trim().toLowerCase());
  if (!user) return null;
  const acc = isEligible(user) ? await getAccount(user.id) : null;
  const swept = acc ? sweep(structuredClone(acc), now) : null;
  return {
    member: { id: user.id, email: user.email, name: user.individual?.fullName ?? user.company?.companyName ?? user.email, accountType: user.accountType, since: acc?.createdAt ?? null },
    summary: summarize(swept, now, [], isEligible(user)),
    entries: [...(swept?.entries ?? [])].sort((a, b) => b.at.localeCompare(a.at)),
  };
}

/** Programme figures: members, points outstanding (a liability at 5 SAR per 100), last 30 days, tiers. */
export async function loyaltyOverview(now = new Date()) {
  const accounts = (await store().list<LoyaltyAccount>(COL, 100_000)).map((a) => sweep(structuredClone(a), now));
  const since = iso(new Date(now.getTime() - 30 * DAY));
  const all = accounts.flatMap((a) => a.entries.map((e) => ({ e, userId: a.userId })));
  const recent = all.filter(({ e }) => e.at >= since);
  const pts = (type: string) => sum(recent.filter(({ e }) => e.type === type).map(({ e }) => e.points));
  const sums = accounts.map((a) => ({ userId: a.userId, s: summarize(a, now) }));
  const available = sum(sums.map((x) => x.s.available));
  const pending = sum(sums.map((x) => x.s.pending));
  const tiers: Record<string, number> = Object.fromEntries(LOYALTY.tiers.map((t) => [t.id, 0]));
  for (const x of sums) tiers[x.s.tier.id]++;
  const users = new Map<string, string>();
  const email = async (id: string) => {
    if (!users.has(id)) users.set(id, (await getUserById(id))?.email ?? id);
    return users.get(id)!;
  };
  const top = await Promise.all(
    sums.sort((a, b) => b.s.available + b.s.pending - (a.s.available + a.s.pending)).slice(0, 20)
      .map(async (x) => ({ email: await email(x.userId), available: x.s.available, pending: x.s.pending, tier: x.s.tier.id })),
  );
  const adjustments = await Promise.all(
    all.filter(({ e }) => e.type === "adjust").sort((a, b) => b.e.at.localeCompare(a.e.at)).slice(0, 50)
      .map(async ({ e, userId }) => ({ at: e.at, email: await email(userId), points: e.points, note: e.note ?? "", by: e.by ?? "" })),
  );
  return {
    members: accounts.length,
    available,
    pending,
    deficit: sum(accounts.map((a) => a.deficit)),
    liabilitySAR: pointsValueSAR(available + pending),
    last30: { earned: pts("earn") + pts("bonus"), redeemed: -pts("redeem") - pts("return"), expired: -pts("expire"), reversed: -pts("reverse") },
    tiers,
    top,
    adjustments,
  };
}

/* ------------------------------------------------------------ expiry reminders */

/** Reminder (in-app and email) 30 days before points expire, once per expiry date. */
export async function expiryReminders(userId: string, now = new Date()): Promise<number> {
  const acc = await getAccount(userId);
  if (!acc) return 0;
  const n = iso(now);
  const horizon = iso(new Date(now.getTime() + LOYALTY.expiryReminderDays * DAY));
  const lots = acc.entries.filter((e) => isLot(e) && e.remaining! > 0 && e.expiresAt! > n && e.expiresAt! <= horizon);
  const byDate = new Map<string, number>();
  for (const l of lots) {
    const d = ksaDate(new Date(l.expiresAt!));
    byDate.set(d, (byDate.get(d) ?? 0) + l.remaining!);
  }
  let created = 0;
  for (const [date, points] of byDate) {
    if (acc.notified.includes(date)) continue;
    const { result: fresh } = await change(userId, now, (a) => {
      if (a.notified.includes(date)) return false;
      a.notified.push(date);
      return true;
    });
    if (!fresh) continue;
    const valueSAR = pointsValueSAR(points);
    const doc: AppNotification = {
      id: `loyalty:${userId}:${date}`, userId, kind: "points", bookingId: "", reference: "", createdAt: n,
      titleAr: `تنتهي صلاحية ${points} نقطة في ${date}`,
      titleEn: `${points} points expire on ${date}`,
      linesAr: [`⭐ لديك ${points} نقطة (بقيمة ${valueSAR} ريال) تنتهي صلاحيتها في ${date}.`, "استخدمها في حجزك القادم: باقة، أو تذاكر فعالية أو قطار، أو شريحة eSIM."],
      linesEn: [`⭐ You have ${points} points (worth SAR ${valueSAR}) expiring on ${date}.`, "Use them on your next booking: a package, event or train tickets, or an eSIM."],
      href: "/account/loyalty", readAt: null, deletedAt: null, email: null, ...(acc.entries.some((e) => e.demo && lots.includes(e)) ? { demo: true } : {}),
    };
    if (!(await store().insert("notifications", doc.id, doc))) continue;
    created++;
    if (doc.demo) continue;
    const owner = await getUserById(userId);
    if (!owner) continue;
    const sent = await notifyTravellers([owner.email], { subject: `Saudi Trip — ${doc.titleEn} / ${doc.titleAr}`, text: [doc.titleEn, ...doc.linesEn, "", doc.titleAr, ...doc.linesAr].join("\n") });
    if (sent) await store().update<AppNotification>("notifications", doc.id, (x) => ({ ...x, email: { to: sent.to, status: sent.status } }));
  }
  return created;
}

/** Daily job: expire points and send expiry reminders for every member. */
export async function runLoyalty(now = new Date()): Promise<{ members: number; reminders: number }> {
  const accounts = await store().list<LoyaltyAccount>(COL, 100_000);
  let reminders = 0;
  for (const a of accounts) {
    if (a.entries.some((e) => isLot(e) && e.remaining! > 0 && e.expiresAt! <= iso(now))) await change(a.userId, now, () => null);
    reminders += await expiryReminders(a.userId, now);
  }
  return { members: accounts.length, reminders };
}

/** Runs a points step after payment: a failure is logged and never undoes the purchase. */
export async function quietly<T>(what: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`loyalty: ${what} failed`, err);
    return fallback;
  }
}
