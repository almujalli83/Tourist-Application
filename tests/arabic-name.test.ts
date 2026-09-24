import { describe, expect, it } from "vitest";
import { extractArabicName, splitArabicName } from "@/lib/arabic-name";

describe("Arabic name from passport", () => {
  it("finds the labelled name and ignores headings and dates", () => {
    const text = "المملكة العربية السعودية\nجواز سفر\nالاسم رشيد بن محمد بن رشيد المجلي\nتاريخ الميلاد ١٤٠٢/٠٣/١٦";
    expect(extractArabicName(text)).toBe("رشيد بن محمد بن رشيد المجلي");
  });

  it("finds an unlabelled name joined with بن", () => {
    expect(extractArabicName("PASSPORT\nرشيد بن محمد بن رشيد المجلي\nRIYADH")).toBe("رشيد بن محمد بن رشيد المجلي");
  });

  it("returns null when there is no plausible name", () => {
    expect(extractArabicName("المملكة العربية السعودية\nجواز سفر")).toBeNull();
  });

  it("splits into first, father, grandfather and family names", () => {
    expect(splitArabicName("رشيد بن محمد بن رشيد المجلي")).toEqual({
      firstNameAr: "رشيد", middleNameAr: "محمد", grandFatherNameAr: "رشيد", familyNameAr: "المجلي",
    });
    expect(splitArabicName("أحمد علي")).toEqual({ firstNameAr: "أحمد", middleNameAr: "", grandFatherNameAr: "", familyNameAr: "علي" });
    expect(splitArabicName("سارة بنت خالد العتيبي")).toMatchObject({ firstNameAr: "سارة", middleNameAr: "خالد", familyNameAr: "العتيبي" });
  });

  it("strips diacritics and tatweel", () => {
    expect(splitArabicName("مُحَمَّـد بن علي الحربي")?.firstNameAr).toBe("محمد");
  });
});

import { nameSimilarity, verifyArabicName } from "@/lib/arabic-name";

describe("Arabic name cross-check with the MRZ", () => {
  it("matches common Arabic names with their Latin spelling", () => {
    const pairs: [string, string][] = [
      ["خالد", "KHALID"], ["المطيري", "ALMUTAIRI"], ["عبدالله", "ABDULLAH"], ["فهد", "FAHAD"], ["رشيد", "RASHEED"],
      ["محمد", "MOHAMMED"], ["المجلي", "ALMUJALLI"], ["عبدالرحمن", "ABDULRAHMAN"], ["القحطاني", "ALGAHTANI"], ["منصور", "MANSOUR"],
    ];
    for (const [ar, en] of pairs) expect(nameSimilarity(ar, en), `${ar} ~ ${en}`).toBeGreaterThanOrEqual(0.75);
  });

  it("rejects OCR misreads and unrelated names", () => {
    expect(nameSimilarity("عالد", "KHALID")).toBeLessThan(0.75);
    expect(nameSimilarity("الب", "KHALID")).toBeLessThan(0.75);
    expect(nameSimilarity("سعيد", "KHALID")).toBeLessThan(0.75);
  });

  it("drops a misread label before the first name", () => {
    expect(splitArabicName("الب خالد بن عبدالله بن فهد المطيري")?.firstNameAr).toBe("خالد");
  });

  it("verifies whole names against the MRZ", () => {
    const mrz = { givenNames: ["KHALID", "ABDULLAH", "F"], familyName: "ALMUTAIRI" };
    expect(verifyArabicName(splitArabicName("خالد بن عبدالله بن فهد المطيري")!, mrz)).toBe(true);
    expect(verifyArabicName(splitArabicName("عالد بن عبدالله بن فهد المطيري")!, mrz)).toBe(false);
  });
});

import { reconcileArabicName } from "@/lib/arabic-name";

describe("reconciling several OCR readings", () => {
  const mrz = { givenNames: ["KHALID", "ABDULLAH", "F"], familyName: "ALMUTAIRI" };
  it("votes per part, normalises common confusions and drops unverifiable parts", () => {
    const readings = [
      splitArabicName("خالد بن عبداللة بن قهد المطيرى")!,
      splitArabicName("خالد بن عبدالله بن فهد المطيري")!,
      splitArabicName("عالد بن عبدالله بن فهد المطتيري")!,
    ];
    expect(reconcileArabicName(readings, mrz)).toEqual({
      firstNameAr: "خالد", middleNameAr: "عبدالله", grandFatherNameAr: "فهد", familyNameAr: "المطيري",
    });
  });
  it("drops a grandfather name whose first letter disagrees with the MRZ initial", () => {
    const r = reconcileArabicName([splitArabicName("خالد بن عبدالله بن قهد المطيري")!], mrz)!;
    expect(r.grandFatherNameAr).toBe("");
    expect(r.firstNameAr).toBe("خالد");
  });
  it("returns null when no reading agrees with the MRZ", () => {
    expect(reconcileArabicName([splitArabicName("سعيد بن علي الزهراني")!], mrz)).toBeNull();
  });
});

describe("extra misread letters", () => {
  it("prefers the reading that matches the MRZ exactly", () => {
    const mrz = { givenNames: ["KHALID", "ABDULLAH", "F"], familyName: "ALMUTAIRI" };
    const r = reconcileArabicName(
      [splitArabicName("خالد بن عبدالله بن فهد المطتيري")!, splitArabicName("خالد بن عبدالله بن فهد المطتيري")!, splitArabicName("خالد بن عبدالله بن فهد المطيري")!],
      mrz,
    )!;
    expect(r.familyNameAr).toBe("المطيري");
  });
});

describe("unconfirmed parts stay empty", () => {
  it("leaves a misread family name empty instead of filling it wrongly", () => {
    const mrz = { givenNames: ["KHALID", "ABDULLAH", "F"], familyName: "ALMUTAIRI" };
    const r = reconcileArabicName([splitArabicName("خالد بن عبدالله بن فهد المطتيري")!], mrz)!;
    expect(r).toEqual({ firstNameAr: "خالد", middleNameAr: "عبدالله", grandFatherNameAr: "فهد", familyNameAr: "" });
  });
});
