import { describe, expect, it } from "vitest";
import { expectedTravellers, fareTypeForAge, occupancyKey, paxFromRooms } from "@/lib/occupancy";
import { validateTraveller } from "@/lib/visa-validation";
import { validAdult } from "./fixtures";

describe("guests and rooms", () => {
  const rooms = [{ adults: 2, childAges: [15, 1] }, { adults: 1, childAges: [7] }];

  it("maps children's ages to airline fare categories", () => {
    expect([0, 1, 2, 11, 12, 17].map(fareTypeForAge)).toEqual(["infant", "infant", "child", "child", "adult", "adult"]);
    expect(paxFromRooms(rooms)).toEqual({ adults: 4, children: 1, infants: 1 });
  });

  it("orders travellers as adults (18+), then minors from oldest to youngest", () => {
    expect(expectedTravellers(rooms)).toEqual([
      { paxType: "adult", declaredAge: null },
      { paxType: "adult", declaredAge: null },
      { paxType: "adult", declaredAge: null },
      { paxType: "adult", declaredAge: 15 },
      { paxType: "child", declaredAge: 7 },
      { paxType: "infant", declaredAge: 1 },
    ]);
  });

  it("binds hotel quotes to the exact occupancy", () => {
    expect(occupancyKey(rooms)).toBe("2a-15.1_1a-7");
    expect(occupancyKey([{ adults: 2, childAges: [] }])).toBe("2a");
  });

  it("requires the date of birth to match the age chosen in the search", () => {
    const ctx = { arrivalDate: "2026-10-10", returnDate: "2026-10-15", today: "2026-09-24", travellerCount: 2 };
    const adult = validAdult();
    const teen = validAdult({ birthDate: "2011-03-01", declaredAge: 15, sponsorIndex: 0, companionType: "SON", job: "Student" });
    expect(validateTraveller(teen, 1, [adult, teen], ctx).birthDate).toBeUndefined();
    expect(validateTraveller({ ...teen, declaredAge: 14 }, 1, [adult, teen], ctx).birthDate).toBe("declaredAge");
    expect(validateTraveller({ ...adult, declaredAge: null, birthDate: "2010-01-01" }, 0, [adult], ctx).birthDate).toBe("adult18");
  });
});
