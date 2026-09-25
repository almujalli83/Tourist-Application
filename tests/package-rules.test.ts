import { describe, expect, it } from "vitest";
import { adultsForPricing, checkPackageRequirements, minimumPackagePrice } from "@/lib/package-rules";
import type { FlightOffer, HotelOffer, SearchCriteria } from "@/lib/types";

const criteria: SearchCriteria = {
  origin: "CAI",
  stays: [{ city: "RUH", nights: 5 }],
  departureDate: "2026-10-10",
  returnDate: "2026-10-15",
  pax: { adults: 2, children: 1, infants: 0 },
  cabin: "economy",
  nationality: "EG",
};
const flight = (legIndex: number) => ({ legIndex, kind: legIndex ? "return" : "outbound", arriveAt: "2026-10-10T11:00" }) as FlightOffer;
const hotel = (stars: number, licenseNo = "10005815") => ({ city: "RUH", stars, licenseNo }) as HotelOffer;
const today = "2026-09-24";
const failed = (r: ReturnType<typeof checkPackageRequirements>) => r.checks.filter((c) => !c.ok).map((c) => c.id);

describe("key package requirements", () => {
  it("prices 2,000 SAR per adult plus 1,000 SAR per adult for each day beyond 2", () => {
    expect(minimumPackagePrice(1, 2)).toBe(2000);
    expect(minimumPackagePrice(2, 5)).toBe(2 * (2000 + 3 * 1000));
    expect(minimumPackagePrice(0, 5)).toBe(0);
  });

  it("counts search adults until birth dates are known, then only travellers aged 18+", () => {
    expect(adultsForPricing(criteria)).toEqual({ adults: 2, fromAges: false });
    const travellers = [{ birthDate: "1990-01-01" }, { birthDate: "2010-01-01" }, { birthDate: "2018-01-01" }];
    expect(adultsForPricing(criteria, travellers)).toEqual({ adults: 1, fromAges: true });
    expect(adultsForPricing(criteria, [{ birthDate: "1990-01-01" }, { birthDate: "" }])).toEqual({ adults: 2, fromAges: false });
  });

  it("passes a complete package priced at or above the minimum (happy path)", () => {
    const r = checkPackageRequirements({ criteria, flights: [flight(0), flight(1)], hotels: [hotel(3)], totalSAR: 10_000, today });
    expect(r.ok).toBe(true);
    expect(r).toMatchObject({ days: 5, adults: 2, minPriceSAR: 10_000, shortfallSAR: 0 });
  });

  it("blocks packages below the minimum price, with the shortfall", () => {
    const r = checkPackageRequirements({ criteria, flights: [flight(0), flight(1)], hotels: [hotel(4)], totalSAR: 9_250.5, today });
    expect(failed(r)).toEqual(["minPrice"]);
    expect(r.shortfallSAR).toBe(749.5);
    // With ages known (one 18+ adult), the same total is enough.
    const withAges = checkPackageRequirements({
      criteria, flights: [flight(0), flight(1)], hotels: [hotel(4)], totalSAR: 9_250.5, today,
      travellers: [{ birthDate: "1990-01-01" }, { birthDate: "2010-01-01" }, { birthDate: "2018-01-01" }],
    });
    expect(withAges.ok).toBe(true);
  });

  it("requires every flight leg, a licensed 3★+ hotel per city and the purchase window", () => {
    expect(failed(checkPackageRequirements({ criteria, flights: [flight(0)], hotels: [hotel(3)], totalSAR: 20_000, today }))).toEqual(["flights"]);
    expect(failed(checkPackageRequirements({ criteria, flights: [flight(0), flight(1)], hotels: [hotel(2)], totalSAR: 20_000, today }))).toEqual(["hotels"]);
    expect(failed(checkPackageRequirements({ criteria, flights: [flight(0), flight(1)], hotels: [hotel(5, "")], totalSAR: 20_000, today }))).toEqual(["hotels"]);
    expect(failed(checkPackageRequirements({ criteria, flights: [flight(0), flight(1)], hotels: [hotel(3)], totalSAR: 20_000, today: "2026-10-08" }))).toEqual(["leadTime"]);
  });
});
