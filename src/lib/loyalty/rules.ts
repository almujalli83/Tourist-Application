/**
 * Loyalty programme rules («مكافآت سعودي تريب» · Saudi Trip Rewards). Pure functions, shared by the
 * server and the checkout screens (the «you'll earn» line and the points discount).
 */

export type EarnService = "package" | "event" | "train" | "esim";
export type TierId = "silver" | "gold" | "platinum";

export const LOYALTY = {
  /**
   * Points pay only for event tickets and transport (trains). Packages are never discounted, so the
   * price sent to the Ministry of Tourism is what the traveller pays; eSIMs only earn.
   */
  redeemableOn: ["event", "train"] as EarnService[],
  /**
   * Points for each full block of riyals paid by card (visa & insurance fees are not counted):
   * packages 2 points per 50 SAR; event tickets, train tickets and eSIMs 1 point per 20 SAR.
   */
  earnRates: {
    package: { points: 2, perSAR: 50 },
    event: { points: 1, perSAR: 20 },
    train: { points: 1, perSAR: 20 },
    esim: { points: 1, perSAR: 20 },
  } as Record<EarnService, { points: number; perSAR: number }>,
  /** 100 points = 5 SAR. */
  sarPerPoint: 0.05,
  minRedeemPoints: 500,
  /** Points expire 24 months after they were earned; a reminder is sent 30 days before. */
  expiryMonths: 24,
  expiryReminderDays: 30,
  /** Points given back after a cancellation stay valid at least this long. */
  returnedValidityDays: 90,
  reviewBonus: 50,
  /** Referral: the member who invited, and the new member, on the new member's first paid purchase. */
  referrerBonus: 500,
  refereeBonus: 250,
  /** Tier by card spend over the last 12 months; the multiplier applies to purchase points. */
  tierWindowDays: 365,
  tiers: [
    { id: "silver", minSpendSAR: 0, multiplier: 1 },
    { id: "gold", minSpendSAR: 15_000, multiplier: 1.25 },
    { id: "platinum", minSpendSAR: 40_000, multiplier: 1.5 },
  ] as { id: TierId; minSpendSAR: number; multiplier: number }[],
} as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function tierFor(spendSAR: number) {
  const tiers = LOYALTY.tiers;
  let tier = tiers[0];
  for (const t of tiers) if (spendSAR >= t.minSpendSAR) tier = t;
  const next = tiers[tiers.indexOf(tier) + 1] ?? null;
  return { tier, next, toNextSAR: next ? round2(Math.max(0, next.minSpendSAR - spendSAR)) : 0 };
}

/** Points earned for a card payment (after the points discount, without government fees). */
export function earnPoints(input: { service: EarnService; eligibleSAR: number; tierMultiplier?: number; campaignMultiplier?: number }): number {
  if (!(input.eligibleSAR > 0)) return 0;
  const rate = LOYALTY.earnRates[input.service];
  const blocks = Math.floor(input.eligibleSAR / rate.perSAR + 1e-9);
  const raw = blocks * rate.points * (input.tierMultiplier ?? 1) * (input.campaignMultiplier ?? 1);
  return Math.floor(raw + 1e-9);
}

export function pointsValueSAR(points: number): number {
  return round2(points * LOYALTY.sarPerPoint);
}

export const canRedeemOn = (service: string) => (LOYALTY.redeemableOn as string[]).includes(service);

/**
 * Most points usable on a purchase: the whole balance, up to the full price (then nothing is left
 * to pay by card). 0 when less than the 500-point minimum could be used.
 */
export function maxRedeemable(input: { totalSAR: number; balance: number }): number {
  const max = Math.min(Math.floor(input.totalSAR / LOYALTY.sarPerPoint + 1e-9), Math.floor(input.balance));
  return max >= LOYALTY.minRedeemPoints ? max : 0;
}

export function redeemError(points: number, input: { totalSAR: number; balance: number }): string | null {
  if (!Number.isInteger(points) || points < 0) return "redeemInvalid";
  if (points === 0) return null;
  if (points < LOYALTY.minRedeemPoints) return "redeemBelowMinimum";
  if (points > input.balance) return "redeemBalance";
  if (points > maxRedeemable(input)) return "redeemAboveMaximum";
  return null;
}

/** Expiry date (ISO) of points earned at `at`. */
export function expiryFrom(at: string): string {
  const d = new Date(at);
  d.setUTCMonth(d.getUTCMonth() + LOYALTY.expiryMonths);
  return d.toISOString();
}

/** Email line about the points used and earned on a purchase (empty when none). */
export function pointsEmailLine(l: { redeemedPoints: number; discountSAR: number; earnedPoints: number } | undefined, ar: boolean): string {
  if (!l) return "";
  const parts: string[] = [];
  if (l.redeemedPoints) parts.push(ar ? `استخدمت ${l.redeemedPoints} نقطة (خصم ${l.discountSAR} ريال قبل ضريبة القيمة المضافة)` : `You used ${l.redeemedPoints} points (SAR ${l.discountSAR} off before VAT)`);
  if (l.earnedPoints) parts.push(ar ? `ستكسب ${l.earnedPoints} نقطة تُضاف لرصيدك بعد انتهاء الخدمة` : `You earn ${l.earnedPoints} points, usable once the service is over`);
  return parts.length ? `\n⭐ ${parts.join(ar ? "، و" : "; ")}.` : "";
}

/** The campaign with the highest multiplier covering this service and destination (already running). */
export function bestCampaign<T extends { multiplier: number; services: EarnService[]; cities: string[] }>(list: T[], service: EarnService, cities: string[] = []): T | null {
  let best: T | null = null;
  for (const c of list) {
    if (c.services.length && !c.services.includes(service)) continue;
    if (c.cities.length && !c.cities.some((x) => cities.includes(x))) continue;
    if (!best || c.multiplier > best.multiplier) best = c;
  }
  return best;
}

/** Standard VAT rate in Saudi Arabia; prices shown to travellers include it. */
export const VAT_RATE = 0.15;

/**
 * VAT with a points discount. Points are the seller's own loyalty programme, so redeeming them is
 * a price reduction: it is taken off before VAT, and VAT is due only on what is actually paid.
 * Earning points is not a supply and carries no VAT.
 */
export function vatBreakdown(totalSAR: number, discountSAR = 0) {
  const paidSAR = round2(totalSAR - discountSAR);
  const vatSAR = round2((paidSAR * VAT_RATE) / (1 + VAT_RATE));
  return { totalSAR: round2(totalSAR), discountSAR: round2(discountSAR), paidSAR, netSAR: round2(paidSAR - vatSAR), vatSAR };
}
