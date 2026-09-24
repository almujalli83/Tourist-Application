import { describe, expect, it } from "vitest";
import { buildLegs, splitNights, stayDates, validateCriteria } from "@/lib/itinerary";
import type { SearchCriteria } from "@/lib/types";

const base: SearchCriteria = {
  origin: "CAI",
  stays: [{ city: "RUH", nights: 3 }, { city: "ULH", nights: 2 }, { city: "JED", nights: 2 }],
  departureDate: "2026-10-10",
  returnDate: "2026-10-17",
  pax: { adults: 2, children: 1, infants: 1 },
  cabin: "economy",
  nationality: "EG",
};

describe("itinerary", () => {
  it("builds international outbound, domestic hops and international return", () => {
    const legs = buildLegs(base);
    expect(legs.map((l) => [l.kind, l.from, l.to, l.date])).toEqual([
      ["outbound", "CAI", "RUH", "2026-10-10"],
      ["domestic", "RUH", "ULH", "2026-10-13"],
      ["domestic", "ULH", "JED", "2026-10-15"],
      ["return", "JED", "CAI", "2026-10-17"],
    ]);
  });

  it("computes hotel stay dates per city", () => {
    expect(stayDates(base)).toEqual([
      { city: "RUH", checkIn: "2026-10-10", checkOut: "2026-10-13", nights: 3 },
      { city: "ULH", checkIn: "2026-10-13", checkOut: "2026-10-15", nights: 2 },
      { city: "JED", checkIn: "2026-10-15", checkOut: "2026-10-17", nights: 2 },
    ]);
  });

  it("splits nights evenly", () => {
    expect(splitNights(["RUH", "JED"], 7)).toEqual([{ city: "RUH", nights: 4 }, { city: "JED", nights: 3 }]);
  });

  it("accepts a valid search", () => {
    expect(validateCriteria(base, "2026-09-24")).toEqual([]);
  });

  it("enforces MT business rules", () => {
    const today = "2026-09-24";
    expect(validateCriteria({ ...base, departureDate: "2026-09-25", returnDate: "2026-10-02" }, today)).toContain("leadTime"); // VTP010
    expect(validateCriteria({ ...base, departureDate: "2026-12-20", returnDate: "2026-12-27" }, today)).toContain("leadTime");
    expect(validateCriteria({ ...base, stays: [{ city: "RUH", nights: 25 }], returnDate: "2026-11-04" }, today)).toContain("duration"); // VTP004
    expect(validateCriteria({ ...base, stays: [{ city: "MED", nights: 7 }] }, today)).toContain("cities"); // VTP006
    expect(validateCriteria({ ...base, pax: { adults: 10, children: 0, infants: 0 } }, today)).toContain("maxAdults");
    expect(validateCriteria({ ...base, pax: { adults: 2, children: 4, infants: 2 } }, today)).toContain("maxMinors"); // TP009
    expect(validateCriteria({ ...base, pax: { adults: 1, children: 0, infants: 2 } }, today)).toContain("infants");
    expect(validateCriteria({ ...base, stays: [{ city: "RUH", nights: 3 }] }, today)).toContain("nightsMismatch");
  });
});
