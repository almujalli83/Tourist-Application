/**
 * Sample points for sandbox mode (no MT credentials), so the programme can be tried without
 * finishing a trip first: an individual member with an empty ledger gets, once, points from a
 * sample trip and a review, pending points from an event, a sample balance (part already used),
 * and points that expire within 30 days (with their reminder). They are marked as samples and can be used on
 * sandbox purchases. Off with DEMO_LOYALTY=off.
 */
import { randomUUID } from "node:crypto";
import { mtConfig } from "../config";
import { store } from "../store";
import { ensureAccount, isEligible } from "./loyalty";
import { earnPoints, expiryFrom, pointsValueSAR } from "./rules";
import type { LoyaltyAccount, LoyaltyEntry } from "./types";

export const demoLoyaltyEnabled = () => mtConfig().mock && process.env.DEMO_LOYALTY !== "off";

const DAY = 86_400_000;

export function sampleEntries(now: Date): LoyaltyEntry[] {
  const ago = (days: number) => new Date(now.getTime() - days * DAY).toISOString();
  const ahead = (days: number) => new Date(now.getTime() + days * DAY).toISOString();
  // Earned 24 months before an expiry 20 days from now.
  const oldAt = new Date(ahead(20));
  oldAt.setUTCMonth(oldAt.getUTCMonth() - 24);
  const sample = { id: randomUUID(), at: ago(55) };
  const earn = (id: string, at: string, service: "package" | "event", ref: string, spendSAR: number, availableAt: string, expiresAt = expiryFrom(at)): LoyaltyEntry => {
    const points = earnPoints({ service, eligibleSAR: spendSAR });
    return { id: randomUUID(), at, type: "earn", points, remaining: points, source: { kind: service, id, reference: ref }, availableAt, expiresAt, spendSAR, multiplier: { tier: 1, campaign: 1 }, demo: true };
  };
  return [
    earn("demo-event-old", oldAt.toISOString(), "event", "EV-DEMO0001", 300, oldAt.toISOString(), ahead(20)),
    earn("demo", ago(60), "package", "TA-DEMO2026", 2400, ago(50)),
    { id: randomUUID(), at: ago(49), type: "bonus", points: 50, remaining: 50, source: { kind: "review", id: "demo-review" }, availableAt: ago(49), expiresAt: expiryFrom(ago(49)), demo: true },
    // A sample balance large enough to try paying event or train tickets with points.
    { id: sample.id, at: sample.at, type: "adjust", points: 2500, remaining: 2000, source: { kind: "admin", id: "demo-balance" }, note: "رصيد تجريبي · Sample balance", by: "sandbox", availableAt: sample.at, expiresAt: expiryFrom(sample.at), demo: true },
    { id: randomUUID(), at: ago(20), type: "redeem", points: -500, source: { kind: "train", id: "demo-train", reference: "TR-DEMO0001" }, discountSAR: pointsValueSAR(500), from: [{ lot: sample.id, points: 500 }], demo: true },
    earn("demo-event", ago(5), "event", "EV-DEMO0002", 180, ahead(10)),
  ];
}

/** Adds the samples once for an individual member whose ledger is empty. */
export async function seedDemoLoyalty(user: { id: string; accountType: string }, now = new Date()): Promise<void> {
  if (!demoLoyaltyEnabled() || !isEligible(user as never)) return;
  const acc = await ensureAccount(user.id, now);
  if (acc.demoSeeded || acc.entries.length) return;
  await store().update<LoyaltyAccount>("loyalty", user.id, (doc) =>
    doc.demoSeeded || doc.entries.length ? doc : { ...doc, demoSeeded: true, entries: sampleEntries(now) },
  );
}
