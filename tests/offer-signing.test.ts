import { describe, expect, it } from "vitest";
import { OFFER_TTL_MS, signOffer, verifyOffer } from "@/lib/agents/offer-signing";

describe("signed offers", () => {
  const offer = { id: "H:1", totalSAR: 4000, nested: { b: 1, a: [1, 2] } };

  it("verifies untouched offers regardless of key order", () => {
    const signed = signOffer(offer);
    expect(verifyOffer(signed)).toBe(true);
    const reordered = JSON.parse(JSON.stringify({ nested: { a: [1, 2], b: 1 }, sig: signed.sig, expiresAt: signed.expiresAt, totalSAR: 4000, id: "H:1" }));
    expect(verifyOffer(reordered)).toBe(true);
  });

  it("rejects tampered, unsigned or expired offers", () => {
    const signed = signOffer(offer);
    expect(verifyOffer({ ...signed, totalSAR: 1 })).toBe(false);
    expect(verifyOffer({ ...signed, expiresAt: new Date(Date.now() + 10 * OFFER_TTL_MS).toISOString() })).toBe(false);
    expect(verifyOffer(offer)).toBe(false);
    expect(verifyOffer(signed, Date.now() + OFFER_TTL_MS + 1000)).toBe(false);
  });
});
