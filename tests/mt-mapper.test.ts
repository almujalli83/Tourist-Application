import { describe, expect, it } from "vitest";
import { getMtClient } from "@/lib/mt-evisa/client";
import { buildSubmitRequests } from "@/lib/mt-evisa/mapper";
import type { FlightOffer, HotelOffer } from "@/lib/types";
import { validAdult } from "./fixtures";

const flight = (kind: FlightOffer["kind"], from: string, to: string, dep: string, arr: string): FlightOffer => ({
  id: `${kind}-${from}`, agentId: "a", agentNameEn: "Agent", agentNameAr: "وكيل", legIndex: 0, kind, from, to, departAt: dep, arriveAt: arr,
  durationMin: 150, stops: 0, carrierCode: "SV", carrierNameEn: "Saudia", carrierNameAr: "السعودية", flightNo: "SV345",
  cabin: "economy", baggageKg: 23, refundable: false, fare: { adult: 1000, child: 750, infant: 100 }, totalSAR: 1000,
});

const hotel: HotelOffer = {
  id: "h1", agentId: "a", agentNameEn: "Agent", agentNameAr: "وكيل", city: "RUH", nameEn: "Hotel", nameAr: "فندق", stars: 5,
  licenseNo: "10005815", districtEn: "", districtAr: "", reviewScore: 9, roomTypeEn: "", roomTypeAr: "", rooms: 1, board: "BB",
  amenities: [], refundable: true, checkIn: "2026-10-10", checkOut: "2026-10-15", nights: 5, pricePerNightSAR: 800, totalSAR: 4000, forPax: "1-1-0",
};

describe("MT SubmitTourismPackage mapping", () => {
  it("builds one request per applicant with shared messageId and applicationNoList", async () => {
    const adult = validAdult();
    const child = validAdult({ paxType: "child", birthDate: "2018-05-01", passportNo: "C1234567", sponsorIndex: 0, companionType: "SON" });
    const reqs = await buildSubmitRequests(getMtClient(), {
      messageId: "9f79b878-036e-423b-b6aa-167fd025e3d8",
      applicationNos: ["20261001000001", "20261001000002"],
      travellers: [adult, child],
      flights: [flight("outbound", "CAI", "RUH", "2026-10-10T08:00", "2026-10-10T11:15"), flight("return", "RUH", "CAI", "2026-10-15T20:30", "2026-10-15T23:00")],
      hotels: [hotel],
      activities: [],
      ticketNos: ["ETKT570001", "ETKT570002"],
      purchaseDate: "2026-09-24",
      departureDate: "2026-10-10",
      returnDate: "2026-10-15",
      visaFeeSAR: 402.21,
    });
    expect(reqs).toHaveLength(2);
    for (const r of reqs) {
      expect(r.messageId).toBe("9f79b878-036e-423b-b6aa-167fd025e3d8");
      expect(r.applicationNoList).toEqual(["20261001000001", "20261001000002"]);
      expect(r.visitorData).toHaveLength(1);
    }
    const [a, c] = reqs.map((r) => r.visitorData[0]);
    expect(a.disclaimerAnswered).toBe("Yes");
    expect(a.mofaQuestionnaireData.entryType).toBe("Single");
    expect(a.personPhoto).not.toMatch(/^data:/);
    expect(a.arrivalAndDepartureData).toMatchObject({ arrivalFlightDate: "2026-10-10", arrivalFlightTime: "11:15", departureDate: "2026-10-15", departureTime: "20:30", arrivalTicketNo: "ETKT570001", returnTicketNo: "ETKT570002" });
    expect(a.generalPackageData).toMatchObject({ purpose: "Tourism", packageDuration: "5", packagePurchaseDate: "2026-09-24", totalPackagePrice: "4402.21" });
    expect(a.accommodationData[0]).toMatchObject({ licenseNo: "10005815", hotelClassification: "5", hotelPrice: "2000.00" });
    expect(a.companionApplicationNo).toBeNull();
    expect(c.companionApplicationNo).toBe("20261001000001");
    expect(c.companionType).not.toBeNull();
    expect(c.arrivalAndDepartureData.flightPrice).toBe("1500.00");
  });
});
