import { describe, expect, it } from "vitest";
import { chargeCard, luhn } from "@/lib/payment";

describe("sandbox payment", () => {
  const card = { holder: "Test", number: "4111 1111 1111 1111", expMonth: "12", expYear: "30", cvc: "123" };
  it("validates card numbers with Luhn", () => {
    expect(luhn("4111111111111111")).toBe(true);
    expect(luhn("4111111111111112")).toBe(false);
  });
  it("approves valid cards and declines test decline cards", async () => {
    expect((await chargeCard(card, 100)).ok).toBe(true);
    expect(await chargeCard({ ...card, number: "4000000000000002" }, 100)).toEqual({ ok: false, code: "declined" });
    expect(await chargeCard({ ...card, expYear: "20" }, 100)).toEqual({ ok: false, code: "expired" });
  });
});
