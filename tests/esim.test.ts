import { describe, expect, it } from "vitest";
import type { PublicUser } from "@/lib/auth/types";
import { cancelEsimOrder, canCancelEsim, esimTotal, EsimError, getEsimOrder, listEsimOrders, placeEsimOrder, recipientOptions, validateBookingEsim } from "@/lib/esim/orders";
import { getPlan, listPlans, suggestPlan } from "@/lib/esim/tygo";
import { store } from "@/lib/store";

const run = Math.random().toString(36).slice(2, 8);
const card = { holder: "Test User", number: "4111111111111111", expMonth: "12", expYear: "30", cvc: "123" };
const user = (id: string): PublicUser => ({ id, email: `${id}@example.com`, accountType: "individual", individual: { fullName: "Sara Ali", phone: "+966500000000", nationality: "EG" }, preferredLocale: "en", preferredCurrency: "SAR", createdAt: "2026-01-01T00:00:00Z" });

describe("Tygo plans", () => {
  it("offers data-only and data + number plans and suggests one covering the trip", () => {
    expect(listPlans().some((p) => p.kind === "data")).toBe(true);
    expect(listPlans().some((p) => p.kind === "dataVoice" && p.minutes > 0)).toBe(true);
    expect(suggestPlan("data", 5).days).toBe(7);
    expect(suggestPlan("data", 10).days).toBe(15);
    expect(suggestPlan("dataVoice", 20).days).toBe(30);
    expect(suggestPlan("data", 200).days).toBe(90);
    expect(esimTotal(getPlan("tygo-d15-15")!, 3)).toBe(357);
  });

  it("validates the eSIM part of a package booking", () => {
    expect(validateBookingEsim(undefined, 3)).toBeNull();
    expect(validateBookingEsim({ planId: "tygo-d7-5", travellers: [] }, 3)).toBeNull();
    expect(validateBookingEsim({ planId: "tygo-d7-5", travellers: [2, 0, 2] }, 3)).toMatchObject({ indexes: [0, 2] });
    expect(() => validateBookingEsim({ planId: "tygo-d7-5", travellers: [3] }, 3)).toThrow(EsimError);
    expect(() => validateBookingEsim({ planId: "nope", travellers: [0] }, 3)).toThrow("invalidEsim");
  });
});

describe("standalone eSIM orders", () => {
  it("issues one eSIM per recipient, emails each traveller and refunds before activation", async () => {
    const buyer = user(`es-${run}`);
    const opts = await recipientOptions(buyer);
    expect(opts[0]).toMatchObject({ ref: "me", name: "Sara Ali", emailMasked: `e•••@example.com` });
    const plan = getPlan("tygo-v15-15")!;
    const input = { planId: plan.id, recipients: ["me"], expectedTotalSAR: plan.priceSAR, idempotencyKey: `k-${run}`, card };
    await expect(placeEsimOrder(buyer, { ...input, recipients: ["saved:nope"] })).rejects.toMatchObject({ code: "invalidRecipient" });
    await expect(placeEsimOrder(buyer, { ...input, expectedTotalSAR: 1 })).rejects.toMatchObject({ code: "priceChanged" });
    await expect(placeEsimOrder(buyer, { ...input, card: { ...card, number: "4000000000000002" } })).rejects.toMatchObject({ code: "payment_declined" });

    const o = await placeEsimOrder(buyer, input);
    expect(o.lines).toHaveLength(1);
    expect(o.lines[0]).toMatchObject({ name: "Sara Ali", email: buyer.email });
    expect(o.lines[0].activationCode).toMatch(/^LPA:1\$[^$]+\$[0-9A-F]{16}$/);
    expect(o.lines[0].phoneNumber).toMatch(/^\+9665\d{8}$/);
    expect(await placeEsimOrder(buyer, input)).toEqual(o);
    const mails = (await store().list<{ to: string[]; subject: string }>("outbox", 2000)).filter((m) => m.to.includes(buyer.email) && m.subject.includes(o.reference));
    expect(mails.length).toBeGreaterThan(0);

    expect(await canCancelEsim(o)).toBe(true);
    const c = await cancelEsimOrder(buyer, o.id);
    expect(c).toMatchObject({ status: "CANCELLED", cancellation: { refundSAR: plan.priceSAR } });
    await expect(cancelEsimOrder(buyer, o.id)).rejects.toMatchObject({ code: "notCancellable" });
    expect(await getEsimOrder(`other-${run}`, o.id)).toBeNull();
    expect((await listEsimOrders(buyer.id)).map((x) => x.id)).toEqual([o.id]);
  });

  it("keeps plans without refund final", async () => {
    const buyer = user(`fin-${run}`);
    const plan = getPlan("tygo-v30-30")!;
    const o = await placeEsimOrder(buyer, { planId: plan.id, recipients: ["me"], expectedTotalSAR: plan.priceSAR, idempotencyKey: `f-${run}`, card });
    expect(await canCancelEsim(o)).toBe(false);
    await expect(cancelEsimOrder(buyer, o.id)).rejects.toMatchObject({ code: "notCancellable" });
  });
});
