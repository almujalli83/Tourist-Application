import { afterEach, describe, expect, it, vi } from "vitest";

async function feeWith(value: string | undefined) {
  vi.resetModules();
  if (value === undefined) delete process.env.VISA_INSURANCE_FEE_SAR;
  else process.env.VISA_INSURANCE_FEE_SAR = value;
  return (await import("@/lib/config")).VISA_INSURANCE_FEE_SAR;
}

describe("visa fee configuration", () => {
  afterEach(() => {
    delete process.env.VISA_INSURANCE_FEE_SAR;
  });

  it("defaults to 402.21 SAR when unset, empty or invalid", async () => {
    expect(await feeWith(undefined)).toBe(402.21);
    expect(await feeWith("")).toBe(402.21);
    expect(await feeWith("  ")).toBe(402.21);
    expect(await feeWith("abc")).toBe(402.21);
    expect(await feeWith("0")).toBe(402.21);
  });

  it("uses a valid configured value", async () => {
    expect(await feeWith("450")).toBe(450);
  });
});
