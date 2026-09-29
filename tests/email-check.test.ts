import { describe, expect, it } from "vitest";
import { suggestEmail } from "@/lib/email-check";

describe("email typo check", () => {
  it("suggests the common domain a mistyped one is close to", () => {
    expect(suggestEmail("sara@gmial.com")).toBe("sara@gmail.com");
    expect(suggestEmail("sara@gmai.com")).toBe("sara@gmail.com");
    expect(suggestEmail("Ali.Hassan@hotmial.com")).toBe("Ali.Hassan@hotmail.com");
    expect(suggestEmail("x@outlok.com")).toBe("x@outlook.com");
    expect(suggestEmail("x@yaho.com")).toBe("x@yahoo.com");
    expect(suggestEmail(" x@icloud.co ")).toBe("x@icloud.com");
  });

  it("fixes a mistyped .com on any domain", () => {
    expect(suggestEmail("info@company.con")).toBe("info@company.com");
    expect(suggestEmail("info@agency-travel.cmo")).toBe("info@agency-travel.com");
  });

  it("leaves correct and unknown addresses alone", () => {
    for (const ok of ["sara@gmail.com", "a@hotmail.co.uk", "info@company.com", "x@moi.gov.sa", "x@university.edu.eg", "x@co.uk"]) expect(suggestEmail(ok)).toBeNull();
    for (const partial of ["", "sara", "sara@", "@gmail.com"]) expect(suggestEmail(partial)).toBeNull();
  });
});
