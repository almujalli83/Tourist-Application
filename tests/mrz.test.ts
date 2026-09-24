import { describe, expect, it } from "vitest";
import { checkDigit, parseMrz, parseMrzText } from "@/lib/mrz";

describe("MRZ parser (ICAO 9303 TD3)", () => {
  // Specimen from ICAO Doc 9303 part 4.
  const l1 = "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<";
  const l2 = "L898902C36UTO7408122F1204159ZE184226B<<<<<10";

  it("computes check digits", () => {
    expect(checkDigit("L898902C3")).toBe(6);
    expect(checkDigit("740812")).toBe(2);
    expect(checkDigit("120415")).toBe(9);
  });

  it("parses the ICAO specimen", () => {
    const r = parseMrz(l1, l2, new Date("2026-01-01"))!;
    expect(r.familyName).toBe("ERIKSSON");
    expect(r.givenNames).toEqual(["ANNA", "MARIA"]);
    expect(r.passportNo).toBe("L898902C3");
    expect(r.birthDate).toBe("1974-08-12");
    expect(r.expiryDate).toBe("2012-04-15");
    expect(r.gender).toBe("2");
    expect(r.valid).toEqual({ passportNo: true, birthDate: true, expiryDate: true, composite: true });
    expect(r.confidence).toBe(1);
  });

  it("maps country codes to ISO2 and tolerates OCR noise", () => {
    const passport = "A12345678";
    const birth = "900127";
    const expiry = "340310";
    const personal = "<<<<<<<<<<<<<<";
    const body = `${passport}${checkDigit(passport)}EGY${birth}${checkDigit(birth)}M${expiry}${checkDigit(expiry)}${personal}${checkDigit(personal)}`;
    const composite = checkDigit(body.slice(0, 10) + body.slice(13, 20) + body.slice(21, 43));
    const line2 = body + composite;
    const text = `REPUBLIC OF EGYPT\nP<EGYMOHAMMAD<<FARAZ<AHMED<<<<<<<<<<<<<<<<<<<\n${line2.replace(/0/g, "O").slice(0, 10)}${line2.slice(10)}`;
    const r = parseMrzText(text, new Date("2026-09-24"))!;
    expect(r.nationality).toBe("EG");
    expect(r.issuingCountry).toBe("EG");
    expect(r.familyName).toBe("MOHAMMAD");
    expect(r.givenNames).toEqual(["FARAZ", "AHMED"]);
    expect(r.birthDate).toBe("1990-01-27");
    expect(r.expiryDate).toBe("2034-03-10");
    expect(r.gender).toBe("1");
    expect(r.valid.birthDate && r.valid.expiryDate).toBe(true);
  });

  it("returns null when no MRZ is present", () => {
    expect(parseMrzText("hello world")).toBeNull();
  });
});
