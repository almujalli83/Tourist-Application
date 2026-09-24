import { describe, expect, it } from "vitest";
import { convertFromSAR, formatMoney } from "@/lib/currency";
import { applicantShare, computePackagePrice } from "@/lib/pricing";
import type { FlightOffer, HotelOffer } from "@/lib/types";

const flight = (adult: number) => ({ fare: { adult, child: adult * 0.75, infant: adult * 0.1 } }) as FlightOffer;
const hotel = (total: number) => ({ totalSAR: total }) as HotelOffer;

describe("pricing", () => {
  it("adds visa & insurance fee (402.21 SAR) per traveller", () => {
    const p = computePackagePrice({
      pax: { adults: 2, children: 1, infants: 1 },
      flights: [flight(1000), flight(400)],
      hotels: [hotel(3000)],
      activities: [],
      visaFeeSAR: 402.21,
    });
    expect(p.flightsSAR).toBe(2 * 1400 + 0.75 * 1400 + 0.1 * 1400);
    expect(p.visaInsuranceSAR).toBe(1608.84);
    expect(p.totalSAR).toBe(Math.round((p.flightsSAR + 3000 + 1608.84) * 100) / 100);
  });

  it("computes per-applicant amounts for MT", () => {
    const s = applicantShare({ paxType: "child", travellers: 4, flights: [flight(1000)], hotels: [hotel(4000)], activities: [], visaFeeSAR: 402.21 });
    expect(s.flightPrice).toBe(750);
    expect(s.hotelPrices).toEqual([1000]);
    expect(s.total).toBe(2152.21);
  });
});

describe("currency", () => {
  it("converts from SAR and formats per locale", () => {
    expect(convertFromSAR(100, "SAR")).toBe(100);
    expect(convertFromSAR(375, "USD")).toBeCloseTo(100, 0);
    expect(formatMoney(402.21, "SAR", "en")).toBe("SAR 402.21");
    expect(formatMoney(402.21, "SAR", "ar")).toBe("402.21 ر.س");
    expect(formatMoney(1000, "KWD", "en")).toMatch(/^KWD \d+\.\d{3}$/);
  });
});
