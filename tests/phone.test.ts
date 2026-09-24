import { describe, expect, it } from "vitest";
import { COUNTRIES } from "@/lib/data/countries";
import { cleanNational, formatE164, parsePhone, PHONE_RULES, validatePhone } from "@/lib/phone";

describe("international mobile numbers", () => {
  it("has a rule for every country in the app", () => {
    expect(COUNTRIES.filter((c) => !PHONE_RULES[c.iso2]).map((c) => c.iso2)).toEqual([]);
  });

  it("formats E.164 and drops the trunk prefix 0", () => {
    expect(cleanNational("050 123 4567")).toBe("501234567");
    expect(formatE164("SA", "0501234567")).toBe("+966501234567");
    expect(formatE164("EG", "01001234567")).toBe("+201001234567");
  });

  it("parses stored numbers, using the hint for shared calling codes", () => {
    expect(parsePhone("+966501234567")).toEqual({ iso2: "SA", national: "501234567" });
    expect(parsePhone("00971501234567")).toEqual({ iso2: "AE", national: "501234567" });
    expect(parsePhone("+14165551234", "CA")).toEqual({ iso2: "CA", national: "4165551234" });
    expect(parsePhone("+79161234567", "KZ")?.iso2).toBe("KZ");
  });

  it("enforces the national number length per country", () => {
    expect(validatePhone("+966501234567")).toBeNull();
    expect(validatePhone("+96650123456")).toBe("mobileLength"); // 8 digits
    expect(validatePhone("+9665012345678")).toBe("mobileLength"); // 10 digits
    expect(validatePhone("+919876543210")).toBeNull();
    expect(validatePhone("+8613812345678")).toBeNull();
    expect(validatePhone("+97312345678")).toBeNull(); // Bahrain 8 digits
    expect(validatePhone("")).toBe("required");
    expect(validatePhone("0501234567")).toBe("mobile");
  });

  it("keeps every valid number within MT's 15-character limit", () => {
    for (const [iso, r] of Object.entries(PHONE_RULES)) {
      expect(`+${r.dial}${"9".repeat(r.max)}`.length, iso).toBeLessThanOrEqual(15);
    }
  });
});
