import { roundSAR } from "./currency";
import type { ActivityOffer, FlightOffer, HotelOffer, PaxCount, PaxType } from "./types";

export interface PriceBreakdown {
  flightsSAR: number;
  hotelsSAR: number;
  activitiesSAR: number;
  visaInsuranceSAR: number;
  visaFeePerTravellerSAR: number;
  travellers: number;
  totalSAR: number;
}

export function priceFlightOffer(fare: FlightOffer["fare"], pax: PaxCount): number {
  return roundSAR(fare.adult * pax.adults + fare.child * pax.children + fare.infant * pax.infants);
}

export function computePackagePrice(input: {
  pax: PaxCount;
  flights: FlightOffer[];
  hotels: HotelOffer[];
  activities: ActivityOffer[];
  visaFeeSAR: number;
}): PriceBreakdown {
  const travellers = input.pax.adults + input.pax.children + input.pax.infants;
  const flightsSAR = roundSAR(input.flights.reduce((a, f) => a + priceFlightOffer(f.fare, input.pax), 0));
  const hotelsSAR = roundSAR(input.hotels.reduce((a, h) => a + h.totalSAR, 0));
  const activitiesSAR = roundSAR(input.activities.reduce((a, x) => a + x.totalSAR, 0));
  const visaInsuranceSAR = roundSAR(input.visaFeeSAR * travellers);
  return {
    flightsSAR,
    hotelsSAR,
    activitiesSAR,
    visaInsuranceSAR,
    visaFeePerTravellerSAR: input.visaFeeSAR,
    travellers,
    totalSAR: roundSAR(flightsSAR + hotelsSAR + activitiesSAR + visaInsuranceSAR),
  };
}

/**
 * Per-applicant amounts required by MT (`totalPackagePrice`, `hotelPrice`, `flightPrice`
 * are captured at applicant level, not group level). Flights use the passenger's own
 * fare; hotels and activities are shared equally among all travellers.
 */
export function applicantShare(input: {
  paxType: PaxType;
  travellers: number;
  flights: FlightOffer[];
  hotels: HotelOffer[];
  activities: ActivityOffer[];
  visaFeeSAR: number;
}) {
  const flightPrice = roundSAR(input.flights.reduce((a, f) => a + f.fare[input.paxType], 0));
  const hotelPrices = input.hotels.map((h) => roundSAR(h.totalSAR / input.travellers));
  const activities = roundSAR(input.activities.reduce((a, x) => a + x.totalSAR, 0) / input.travellers);
  const total = roundSAR(flightPrice + hotelPrices.reduce((a, b) => a + b, 0) + activities + input.visaFeeSAR);
  return { flightPrice, hotelPrices, activities, total };
}
