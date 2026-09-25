import { describe, expect, it } from "vitest";
import { formatExpiryInput, parseExpiry } from "@/lib/card-expiry";
import { chargeCard } from "@/lib/payment";

describe("card expiry input", () => {
  it("inserts the slash and reads the year with or without it", () => {
    expect(formatExpiryInput("1229")).toBe("12/29");
    expect(formatExpiryInput("12/29")).toBe("12/29");
    expect(formatExpiryInput("12")).toBe("12");
    expect(formatExpiryInput("123")).toBe("12/3");
    expect(formatExpiryInput("5")).toBe("05");
    expect(formatExpiryInput("1/29")).toBe("01/29");
    expect(parseExpiry("1229")).toEqual({ expMonth: "12", expYear: "29" });
    expect(parseExpiry("12/2029")).toEqual({ expMonth: "12", expYear: "29" });
    expect(parseExpiry("12 / 29")).toEqual({ expMonth: "12", expYear: "29" });
  });

  it("accepts the test card typed without a slash", async () => {
    const res = await chargeCard({ holder: "TEST USER", number: "4111 1111 1111 1111", cvc: "123", ...parseExpiry("1229") }, 100, new Date("2026-09-25"));
    expect(res.ok).toBe(true);
  });
});
