export type Locale = "ar" | "en";
export type CabinClass = "economy" | "premium" | "business" | "first";
export type PaxType = "adult" | "child" | "infant";
export type AccountType = "individual" | "company";

export interface PaxCount {
  adults: number;
  children: number;
  infants: number;
}

export interface CityStay {
  city: string; // Saudi city IATA code
  nights: number;
}

export interface SearchCriteria {
  origin: string; // IATA code
  stays: CityStay[]; // ordered destinations with nights
  departureDate: string; // YYYY-MM-DD
  returnDate: string; // YYYY-MM-DD
  pax: PaxCount;
  cabin: CabinClass;
  nationality: string; // ISO2
}

export type LegKind = "outbound" | "domestic" | "return";

export interface FlightLeg {
  index: number;
  kind: LegKind;
  from: string;
  to: string;
  date: string;
}

export interface TravelAgentRef {
  /** Set by the server when an offer is returned; checked when booking. */
  expiresAt?: string;
  sig?: string;
  agentId: string;
  agentNameEn: string;
  agentNameAr: string;
}

export interface FlightOffer extends TravelAgentRef {
  id: string;
  legIndex: number;
  kind: LegKind;
  from: string;
  to: string;
  departAt: string; // YYYY-MM-DDTHH:mm (local)
  arriveAt: string;
  durationMin: number;
  stops: number;
  carrierCode: string;
  carrierNameEn: string;
  carrierNameAr: string;
  flightNo: string;
  cabin: CabinClass;
  baggageKg: number;
  refundable: boolean;
  fare: { adult: number; child: number; infant: number }; // SAR per passenger
  totalSAR: number;
}

export interface HotelOffer extends TravelAgentRef {
  id: string;
  city: string;
  nameEn: string;
  nameAr: string;
  stars: number;
  /** Tourism license number — required by the MT eVisa accommodationData. */
  licenseNo: string;
  districtEn: string;
  districtAr: string;
  reviewScore: number;
  roomTypeEn: string;
  roomTypeAr: string;
  rooms: number;
  board: "RO" | "BB" | "HB" | "FB";
  amenities: string[];
  refundable: boolean;
  checkIn: string;
  checkOut: string;
  nights: number;
  pricePerNightSAR: number;
  totalSAR: number;
  /** Traveller mix the price was quoted for ("adults-children-infants"). */
  forPax: string;
}

export type ActivityKind = "event" | "tour" | "restaurant";

export interface ActivityOffer extends TravelAgentRef {
  id: string;
  kind: ActivityKind;
  city: string;
  titleEn: string;
  titleAr: string;
  venueEn: string;
  venueAr: string;
  date: string;
  timeFrom: string;
  timeTo: string;
  pricePerPersonSAR: number;
  vatSAR: number;
  serviceChargeSAR: number;
  totalSAR: number; // for the whole party
  partySize: number;
  forPax: string;
}

/* ---------------- Traveller / visa application data ---------------- */

export type YesNo = "true" | "false";

export interface ClarifiedAnswer {
  answer: YesNo | "";
  clarification: string;
}

export interface SecurityAnswers {
  moneyLaunderingOffence: ClarifiedAnswer;
  servedJailTime: ClarifiedAnswer;
  servedInMilitary: ClarifiedAnswer;
  workedInPoliticsOrMedia: ClarifiedAnswer;
  joinedOrganizationOrParty: ClarifiedAnswer;
  beenDeported: YesNo | "";
  crimeFromInterpool: YesNo | "";
  passportRestricted: YesNo | "";
}

export interface InsuranceAnswers {
  question1: YesNo | "";
  question2: YesNo | "";
  question3: YesNo | "";
  question4: YesNo | "";
  question5: YesNo | "";
  question6: string; // months of pregnancy
}

export interface Traveller {
  paxType: PaxType;
  firstNameEn: string;
  middleNameEn: string;
  grandFatherNameEn: string;
  familyNameEn: string;
  firstNameAr: string;
  middleNameAr: string;
  grandFatherNameAr: string;
  familyNameAr: string;
  birthDate: string;
  birthplace: string; // ISO2
  gender: "1" | "2" | "";
  job: string;
  nationality: string; // ISO2
  passportNo: string;
  passportType: "1" | "2" | "3";
  passportIssueDate: string;
  passportExpiryDate: string;
  passportIssuePlace: string; // ISO2
  religion: "1" | "2" | "";
  maritalStatus: "1" | "2" | "3" | "4" | "5" | "";
  email: string;
  mobileNo: string;
  zipCode: string;
  /** Index of the sponsor traveller inside the package (minors must have one). */
  sponsorIndex: number | null;
  companionType: string; // MT companion type code, e.g. SPOUSE / SON
  personPhoto: string; // data URL (JPEG/PNG)
  passportImage: string; // data URL
  security: SecurityAnswers;
  insurance: InsuranceAnswers;
  /** Client-only: the saved traveller this form was filled from, and whether to save it back. */
  savedId?: string | null;
  saveToAccount?: boolean;
}

export interface BookingSelection {
  criteria: SearchCriteria;
  /** The selected offers exactly as returned (signed) by the search APIs. */
  offers: { flights: FlightOffer[]; hotels: HotelOffer[]; activities: ActivityOffer[] };
  flights: Record<number, string>; // legIndex -> offer id
  hotels: Record<string, string>; // city -> offer id
  activities: string[]; // offer ids
}
