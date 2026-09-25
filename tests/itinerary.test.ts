import { describe, expect, it } from "vitest";
import { buildLegs, splitNights, stayDates, validateCriteria } from "@/lib/itinerary";
import { addDays } from "@/lib/dates";
import { paxFromRooms } from "@/lib/occupancy";
import type { SearchCriteria } from "@/lib/types";

const base: SearchCriteria = {
  origin: "CAI",
  stays: [{ city: "RUH", nights: 3 }, { city: "ULH", nights: 2 }, { city: "JED", nights: 2 }],
  departureDate: "2026-10-10",
  returnDate: "2026-10-17",
  rooms: [{ adults: 2, childAges: [5, 1] }],
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

  it("enforces the key package rules", () => {
    const today = "2026-09-24";
    const trip = (departureDate: string, nights: number) => ({ ...base, departureDate, returnDate: addDays(departureDate, nights), stays: [{ city: "RUH", nights }] });
    // Purchase-to-travel: at least 3 days (and at most 80, VTP010)
    expect(validateCriteria(trip("2026-09-26", 5), today)).toContain("leadTime");
    expect(validateCriteria(trip("2026-09-27", 5), today)).not.toContain("leadTime");
    expect(validateCriteria(trip("2026-12-20", 5), today)).toContain("leadTime");
    // Duration: 2 to 88 days
    expect(validateCriteria(trip("2026-10-10", 1), today)).toContain("duration");
    expect(validateCriteria(trip("2026-10-10", 88), today)).toEqual([]);
    expect(validateCriteria(trip("2026-10-10", 89), today)).toContain("duration");
    // All regions: Madinah is allowed; unknown or non-airport destinations are not
    expect(validateCriteria({ ...base, stays: [{ city: "MED", nights: 7 }] }, today)).toEqual([]);
    expect(validateCriteria({ ...base, stays: [{ city: "MKK", nights: 7 }] }, today)).toContain("cities");
    const withRooms = (rooms: SearchCriteria["rooms"]) => ({ ...base, rooms, pax: paxFromRooms(rooms) });
    expect(validateCriteria(withRooms([{ adults: 4, childAges: [] }, { adults: 4, childAges: [] }, { adults: 2, childAges: [] }]), today)).toContain("maxAdults");
    expect(validateCriteria(withRooms([{ adults: 2, childAges: [3, 4, 5, 6] }, { adults: 1, childAges: [8, 9] }]), today)).toContain("maxMinors");
    expect(validateCriteria(withRooms([{ adults: 1, childAges: [0, 1] }]), today)).toContain("infants");
    expect(validateCriteria(withRooms([{ adults: 1, childAges: [15, 0] }]), today)).toEqual([]); // a 15-year-old flies on an adult fare
    expect(validateCriteria(withRooms([{ adults: 1, childAges: [-1] }]), today)).toContain("childAges");
    expect(validateCriteria(withRooms([{ adults: 0, childAges: [10] }]), today)).toContain("rooms");
    expect(validateCriteria({ ...base, pax: { adults: 3, children: 1, infants: 1 } }, today)).toContain("pax");
    expect(validateCriteria({ ...base, stays: [{ city: "RUH", nights: 3 }] }, today)).toContain("nightsMismatch");
  });
});
