import { describe, expect, it } from "vitest";
import { extractDates, guessIssueDate } from "@/lib/passport-visual";

describe("passport visual zone", () => {
  const text = `KINGDOM OF SAUDI ARABIA
Name ALMUJALLI, RASHEED MOHAMMED R
Date of Birth 30 Dec 1983  1402/03/16
Date of Issue 19 Jan 2014   Date of Expiry 28 Nov 2018
Issuing Authority RIYADH`;

  it("extracts Gregorian dates in common formats", () => {
    expect(extractDates(text)).toEqual(expect.arrayContaining(["1983-12-30", "2014-01-19", "2018-11-28"]));
    expect(extractDates("issued 05/07/2021 and 2031-07-04")).toEqual(["2021-07-05", "2031-07-04"]);
    expect(extractDates("19JAN14")).toEqual(["2014-01-19"]);
  });

  it("guesses the issue date between birth and expiry", () => {
    expect(guessIssueDate(text, "1983-12-30", "2018-11-28")).toBe("2014-01-19");
  });

  it("returns null when ambiguous or absent", () => {
    expect(guessIssueDate("no dates here", "1983-12-30", "2018-11-28")).toBeNull();
    expect(guessIssueDate("01 Jan 2012 and 02 Feb 2013", "1983-12-30", "2018-11-28")).toBeNull();
  });
});
