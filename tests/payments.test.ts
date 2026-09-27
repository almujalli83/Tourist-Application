import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicUser } from "@/lib/auth/types";
import { chargeCard, refundPayment } from "@/lib/payment";
import { payConfig } from "@/lib/payments/gateway";
import { createIntent, deleteSavedCard, getIntent, listSavedCards, sandboxThreeDs, settleIntent, submitOtp, voidIntent, voidStaleIntents } from "@/lib/payments/intents";
import { buyTickets, listProducts } from "@/lib/transit/transit";

const user = (id: string): PublicUser => ({ id, email: `${id}@example.com`, accountType: "individual", individual: { fullName: "Sara Ali", phone: "+966500000000", nationality: "EG" }, preferredLocale: "ar", preferredCurrency: "SAR", createdAt: "2026-01-01T00:00:00Z" });
const card = (number = "4111111111111111") => ({ type: "card" as const, holder: "SARA ALI", number, expMonth: "12", expYear: "30", cvc: "123" });

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PAYMENT_GATEWAY;
});

describe("payment intents (sandbox gateway)", () => {
  it("authorizes a card and settles it once, for the authorized amount only", async () => {
    const u = user("pay-1");
    const i = await createIntent(u, { amountSAR: 100, description: "test", source: card() });
    expect(i).toMatchObject({ status: "authorized", method: "card", brand: "visa", last4: "1111", sandbox: true });
    expect((await settleIntent(i.id, 120)).ok).toBe(false); // more than authorized
    const a = await chargeCard({ paymentId: i.id }, 60);
    expect(a).toMatchObject({ ok: true, transactionId: `pi_${i.id}`, method: "visa", last4: "1111" });
    // One checkout can pay several orders up to the total (a package and its plan's tickets).
    expect((await chargeCard({ paymentId: i.id }, 40)).ok).toBe(true);
    expect((await chargeCard({ paymentId: i.id }, 1)).ok).toBe(false);
    expect((await getIntent(u.id, i.id)).status).toBe("captured");
    expect(await refundPayment(`pi_${i.id}`, 30)).toMatchObject({ ok: true });
    expect((await getIntent(u.id, i.id)).status).toBe("partially_refunded");
    expect(await refundPayment(`pi_${i.id}`, 500)).toMatchObject({ ok: true }); // capped at what is left
    expect((await getIntent(u.id, i.id)).status).toBe("refunded");
  });

  it("declines, and validates card details", async () => {
    const u = user("pay-2");
    await expect(createIntent(u, { amountSAR: 50, source: card("4000000000000002") })).rejects.toMatchObject({ code: "declined" });
    await expect(createIntent(u, { amountSAR: 50, source: card("1234") })).rejects.toMatchObject({ code: "invalid_card" });
    await expect(createIntent(u, { amountSAR: 0, source: card() })).rejects.toMatchObject({ code: "invalid_amount" });
    expect((await chargeCard({ paymentId: "nope" }, 10)).ok).toBe(false);
  });

  it("3-D Secure: the bank page approves or fails", async () => {
    const u = user("pay-3");
    const i = await createIntent(u, { amountSAR: 80, source: card("4000000000001091") });
    expect(i.status).toBe("requires_action");
    expect(i.action).toEqual({ type: "3ds", url: `/pay/3ds/${i.id}` });
    expect((await chargeCard({ paymentId: i.id }, 80)).ok).toBe(false); // not authorized yet
    await expect(sandboxThreeDs("someone-else", i.id, true)).rejects.toMatchObject({ code: "not_found" });
    expect((await sandboxThreeDs(u.id, i.id, true)).status).toBe("authorized");
    expect((await chargeCard({ paymentId: i.id }, 80)).ok).toBe(true);
    const j = await createIntent(u, { amountSAR: 80, source: card("4000000000001091") });
    expect((await sandboxThreeDs(u.id, j.id, false))).toMatchObject({ status: "failed", error: "3ds_failed" });
  });

  it("Apple Pay, Google Pay and STC Pay (OTP)", async () => {
    const u = user("pay-4");
    expect((await createIntent(u, { amountSAR: 20, source: { type: "applepay", token: "sandbox-applepay" } })).status).toBe("authorized");
    expect((await createIntent(u, { amountSAR: 20, source: { type: "googlepay", token: "sandbox-googlepay" } })).method).toBe("googlepay");
    await expect(createIntent(u, { amountSAR: 20, source: { type: "applepay", token: "forged" } })).rejects.toMatchObject({ code: "declined" });
    const s = await createIntent(u, { amountSAR: 20, source: { type: "stcpay", mobile: "0501234567" } });
    expect(s.action).toEqual({ type: "otp" });
    await expect(submitOtp(u.id, s.id, "000000")).rejects.toMatchObject({ code: "invalid_otp" });
    expect((await submitOtp(u.id, s.id, "123456")).status).toBe("authorized");
  });

  it("saves cards as gateway tokens and pays with CVV only", async () => {
    const u = user("pay-5");
    await createIntent(u, { amountSAR: 30, source: card(), save: true });
    await createIntent(u, { amountSAR: 30, source: card(), save: true }); // same card once
    const cards = await listSavedCards(u.id);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ brand: "visa", last4: "1111", expMonth: "12", expYear: "30" });
    expect(JSON.stringify(cards)).not.toContain("tok_");
    const i = await createIntent(u, { amountSAR: 30, source: { type: "saved", cardId: cards[0].id, cvc: "123" } });
    expect(i).toMatchObject({ status: "authorized", last4: "1111" });
    await expect(createIntent(user("pay-x"), { amountSAR: 30, source: { type: "saved", cardId: cards[0].id, cvc: "123" } })).rejects.toMatchObject({ code: "invalid_card" });
    expect(await deleteSavedCard("pay-x", cards[0].id)).toBe(false);
    expect(await deleteSavedCard(u.id, cards[0].id)).toBe(true);
  });

  it("voids unused authorizations (by the traveller, or after 30 minutes)", async () => {
    const u = user("pay-6");
    const i = await createIntent(u, { amountSAR: 10, source: card() });
    expect((await voidIntent(u.id, i.id)).status).toBe("voided");
    expect((await chargeCard({ paymentId: i.id }, 10)).ok).toBe(false);
    const j = await createIntent(u, { amountSAR: 10, source: card() }, new Date("2026-10-01T09:00:00Z"));
    expect(await voidStaleIntents(new Date("2026-10-01T09:31:00Z"))).toBeGreaterThanOrEqual(1);
    expect((await getIntent(u.id, j.id)).status).toBe("voided");
  });

  it("orders pay with an intent (transit tickets)", async () => {
    const u = user("pay-7");
    const { products } = await listProducts("RUH");
    const p = products.find((x) => x.id === "2h")!;
    const i = await createIntent(u, { amountSAR: p.priceSAR * 2, source: { type: "applepay", token: "sandbox-applepay" } });
    const ts = await buyTickets(u, { city: "RUH", productId: "2h", qty: 2, expectedTotalSAR: p.priceSAR * 2, card: { paymentId: i.id } });
    expect(ts).toHaveLength(2);
    await expect(buyTickets(u, { city: "RUH", productId: "2h", qty: 2, expectedTotalSAR: p.priceSAR * 2, card: { paymentId: i.id } })).rejects.toMatchObject({ code: "declined" });
  });
});

describe("live gateway", () => {
  it("exposes the tokenizer and wallets; raw cards never reach the server", async () => {
    process.env.PAYMENT_GATEWAY = JSON.stringify({ id: "psp", url: "https://api.psp.test/v1", secretKey: "sk_x", publishableKey: "pk_x", tokenizeUrl: "https://api.psp.test/v1/tokens", applePayMerchantId: "merchant.sa.trip", stcPay: true });
    expect(payConfig()).toMatchObject({ sandbox: false, tokenizeUrl: "https://api.psp.test/v1/tokens", publishableKey: "pk_x", applePay: { merchantId: "merchant.sa.trip" }, googlePay: null, stcPay: true });
    expect(JSON.stringify(payConfig())).not.toContain("sk_x");
    await expect(createIntent(user("pay-8"), { amountSAR: 10, source: card() })).rejects.toMatchObject({ code: "authentication_required" });
    expect((await chargeCard({ holder: "A", number: "4111111111111111", expMonth: "12", expYear: "30", cvc: "123" }, 10)).ok).toBe(false);
    const f = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/payments") ? { id: "pay_1", status: "initiated", source: { company: "mada", last4: "4242", transaction_url: "https://bank.test/3ds" } } : { id: "pay_1", status: "paid", source: { company: "mada", last4: "4242" } }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const i = await createIntent(user("pay-8"), { amountSAR: 10, source: { type: "token", token: "tok_1" } });
    expect(i).toMatchObject({ status: "requires_action", action: { type: "3ds", url: "https://bank.test/3ds" }, brand: "mada", sandbox: false });
    expect((await getIntent("pay-8", i.id)).status).toBe("authorized");
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ amount: 1000, currency: "SAR", source: { type: "token", token: "tok_1" } });
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("sk_x:").toString("base64")}`);
  });
});
