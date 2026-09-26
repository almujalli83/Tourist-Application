/**
 * Sample points for sandbox mode (no MT credentials), so the programme can be tried without
 * finishing a trip first: an individual member with an empty ledger gets, once, points from a
 * sample trip and a review, pending points from an event, points already used, and points that
 * expire within 30 days (with their reminder). They are marked as samples and can be used on
 * sandbox purchases. Off with DEMO_LOYALTY=off.
 */
import { randomUUID } from "node:crypto";
import { mtConfig } from "../config";
import { store } from "../store";
import { ensureAccount, isEligible } from "./loyalty";
import { expiryFrom, pointsValueSAR } from "./rules";
import type { LoyaltyAccount, LoyaltyEntry } from "./types";

export const demoLoyaltyEnabled = () => mtConfig().mock && process.env.DEMO_LOYALTY !== "off";

const DAY = 86_400_000;

export function sampleEntries(now: Date): LoyaltyEntry[] {
  const ago = (days: number) => new Date(now.getTime() - days * DAY).toISOString();
  const ahead = (days: number) => new Date(now.getTime() + days * DAY).toISOString();
  const trip = { id: randomUUID(), at: ago(60), points: 2400 };
  // Earned 24 months before an expiry 20 days from now.
  const oldAt = new Date(ahead(20));
  oldAt.setUTCMonth(oldAt.getUTCMonth() - 24);
  const old = { id: randomUUID(), at: oldAt.toISOString() };
  return [
    { id: old.id, at: old.at, type: "earn", points: 300, remaining: 300, source: { kind: "event", id: "demo-event-old", reference: "EV-DEMO0001" }, availableAt: old.at, expiresAt: ahead(20), spendSAR: 300, multiplier: { tier: 1, campaign: 1 }, demo: true },
    { id: trip.id, at: trip.at, type: "earn", points: trip.points, remaining: 1900, source: { kind: "package", id: "demo", reference: "TA-DEMO2026" }, availableAt: ago(50), expiresAt: expiryFrom(trip.at), spendSAR: 1200, multiplier: { tier: 1, campaign: 1 }, demo: true },
    { id: randomUUID(), at: ago(49), type: "bonus", points: 50, remaining: 50, source: { kind: "review", id: "demo-review" }, availableAt: ago(49), expiresAt: expiryFrom(ago(49)), demo: true },
    { id: randomUUID(), at: ago(20), type: "redeem", points: -500, source: { kind: "train", id: "demo-train", reference: "TR-DEMO0001" }, discountSAR: pointsValueSAR(500), from: [{ lot: trip.id, points: 500 }], demo: true },
    { id: randomUUID(), at: ago(5), type: "earn", points: 180, remaining: 180, source: { kind: "event", id: "demo-event", reference: "EV-DEMO0002" }, availableAt: ahead(10), expiresAt: expiryFrom(ago(5)), spendSAR: 180, multiplier: { tier: 1, campaign: 1 }, demo: true },
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
