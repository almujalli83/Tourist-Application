import { describe, expect, it } from "vitest";
import { validatePackageComposition, validateTraveller } from "@/lib/visa-validation";
import { validAdult } from "./fixtures";

const ctx = { arrivalDate: "2026-10-10", returnDate: "2026-10-17", today: "2026-09-24", travellerCount: 1 };

describe("traveller validation (MT §2.4)", () => {
  it("accepts a complete adult", () => {
    const t = validAdult();
    expect(validateTraveller(t, 0, [t], ctx)).toEqual({});
  });

  it("requires Arabic names for nationals of Arab countries", () => {
    const t = validAdult({ nationality: "EG" });
    const e = validateTraveller(t, 0, [t], ctx);
    expect(e.firstNameAr).toBe("required");
    expect(e.familyNameAr).toBe("required");
    const ok = validAdult({ nationality: "EG", firstNameAr: "فراز", familyNameAr: "محمد" });
    expect(validateTraveller(ok, 0, [ok], ctx)).toEqual({});
  });

  it("validates name alphabets and lengths", () => {
    const t = validAdult({ nationality: "EG", firstNameEn: "فراز", familyNameEn: "A".repeat(16), firstNameAr: "Faraz", familyNameAr: "محمد" });
    const e = validateTraveller(t, 0, [t], ctx);
    expect(e.firstNameEn).toBe("latinOnly");
    expect(e.familyNameEn).toBe("max15");
    expect(e.firstNameAr).toBe("arabicOnly");
  });

  it("requires clarification when a security answer is yes", () => {
    const t = validAdult();
    t.security = { ...t.security, servedInMilitary: { answer: "true", clarification: "" } };
    expect(validateTraveller(t, 0, [t], ctx)["security.servedInMilitary"]).toBe("clarificationRequired");
  });

  it("requires pregnancy months when question 4 is yes", () => {
    const t = validAdult({ gender: "2", insurance: { question1: "false", question2: "false", question3: "false", question4: "true", question5: "", question6: "0" } });
    expect(validateTraveller(t, 0, [t], ctx)["insurance.question6"]).toBe("pregnancyMonths");
  });

  it("checks passport validity (6 months from arrival) and mobile format", () => {
    const t = validAdult({ passportExpiryDate: "2027-01-01", mobileNo: "0501234567" });
    const e = validateTraveller(t, 0, [t], ctx);
    expect(e.passportExpiryDate).toBe("passportValidity");
    expect(e.mobileNo).toBe("mobile");
  });

  it("requires a sponsor for minors and an adult sponsor", () => {
    const adult = validAdult();
    const child = validAdult({ paxType: "child", birthDate: "2018-05-01", passportNo: "C1234567", sponsorIndex: null, companionType: "" });
    expect(validateTraveller(child, 1, [adult, child], ctx).sponsorIndex).toBe("minorNeedsSponsor");
    const sponsored = { ...child, sponsorIndex: 0, companionType: "SON" };
    expect(validateTraveller(sponsored, 1, [adult, sponsored], ctx)).toEqual({});
  });

  it("enforces photo size 5–100 KB and passport image ≤ 1 MB", () => {
    const t = validAdult({ personPhoto: `data:image/jpeg;base64,${"A".repeat(200_000)}`, passportImage: `data:image/jpeg;base64,${"A".repeat(1_500_000)}` });
    const e = validateTraveller(t, 0, [t], ctx);
    expect(e.personPhoto).toBe("photoSize");
    expect(e.passportImage).toBe("max1mb");
  });

  it("limits package composition to 9 adults and 5 minors", () => {
    const adults = Array.from({ length: 10 }, () => validAdult());
    expect(validatePackageComposition(adults, ctx.arrivalDate).errors).toContain("maxAdults");
  });
});

describe("Arabic names for non-Arab nationals", () => {
  it("ignores leftover Arabic names when the nationality is not Arab", () => {
    const t = validAdult({ nationality: "IN", firstNameAr: "Faraz" });
    expect(validateTraveller(t, 0, [t], ctx)).toEqual({});
  });
});
