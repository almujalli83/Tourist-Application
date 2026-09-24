/**
 * Maps an app booking + traveller data to MT SubmitTourismPackage requests.
 * One request per applicant, sharing the same messageId and applicationNoList (§2.2).
 */
import { mtConfig } from "../config";
import { diffDays } from "../dates";
import { getSaudiCity } from "../data/cities";
import { isArabCountry } from "../data/countries";
import { applicantShare } from "../pricing";
import type { ActivityOffer, FlightOffer, HotelOffer, Traveller } from "../types";
import type { MtClient } from "./client";
import { lookupId } from "./lookups";
import type { MtVisitorData, SubmitTourismPackageRequest } from "./types";

const b64 = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(",") + 1);
const orNull = (s: string) => (s.trim() ? s.trim() : null);
const money = (n: number) => n.toFixed(2);

export interface MapInput {
  messageId: string;
  applicationNos: string[];
  travellers: Traveller[];
  flights: FlightOffer[];
  hotels: HotelOffer[];
  activities: ActivityOffer[];
  ticketNos: string[]; // per flight offer
  purchaseDate: string;
  departureDate: string;
  returnDate: string;
  visaFeeSAR: number;
  requestInitiatedBy?: string;
}

export async function buildSubmitRequests(client: MtClient, input: MapInput): Promise<SubmitTourismPackageRequest[]> {
  const [birth, nat, issue, city, entry, exit, companion] = await Promise.all([
    client.getLookup("getbirthPlace"),
    client.getLookup("getNationality"),
    client.getLookup("getPassportIssuePlace"),
    client.getLookup("getCity"),
    client.getLookup("getEntryPort"),
    client.getLookup("getExitPort"),
    client.getLookup("getCompanionType"),
  ]);
  const outboundIdx = input.flights.findIndex((f) => f.kind === "outbound");
  const returnIdx = input.flights.findIndex((f) => f.kind === "return");
  const outbound = input.flights[outboundIdx];
  const ret = input.flights[returnIdx];
  const travellersCount = input.travellers.length;

  return input.travellers.map((t, i) => {
    const share = applicantShare({
      paxType: t.paxType,
      travellers: travellersCount,
      flights: input.flights,
      hotels: input.hotels,
      activities: input.activities,
      visaFeeSAR: input.visaFeeSAR,
    });
    const arab = isArabCountry(t.nationality);
    const visitor: MtVisitorData = {
      applicationNo: input.applicationNos[i],
      firstNameAr: arab ? orNull(t.firstNameAr) : null,
      middleNameAr: arab ? orNull(t.middleNameAr) : null,
      grandFatherNameAr: arab ? orNull(t.grandFatherNameAr) : null,
      familyNameAr: arab ? orNull(t.familyNameAr) : null,
      firstNameEn: t.firstNameEn.trim(),
      middleNameEn: orNull(t.middleNameEn),
      grandFatherNameEn: orNull(t.grandFatherNameEn),
      familyNameEn: t.familyNameEn.trim(),
      birthDate: t.birthDate,
      birthplace: lookupId(birth, t.birthplace),
      gender: t.gender as "1" | "2",
      job: t.job.trim(),
      nationality: lookupId(nat, t.nationality),
      passportIssueDate: t.passportIssueDate,
      passportExpiryDate: t.passportExpiryDate,
      passportIssuePlace: lookupId(issue, t.passportIssuePlace),
      passportNo: t.passportNo.trim().toUpperCase(),
      passportType: t.passportType,
      personPhoto: b64(t.personPhoto),
      religion: t.religion,
      maritalStatus: t.maritalStatus,
      zipCode: orNull(t.zipCode),
      email: t.email.trim(),
      companionType: t.sponsorIndex !== null ? lookupId(companion, t.companionType) : null,
      companionApplicationNo: t.sponsorIndex !== null ? input.applicationNos[t.sponsorIndex] : null,
      disclaimerAnswered: "Yes",
      generalPackageData: {
        purpose: "Tourism",
        packagePurchaseDate: input.purchaseDate,
        totalPackagePrice: money(share.total),
        packageDuration: String(diffDays(input.departureDate, input.returnDate)),
        ...(input.requestInitiatedBy ? { requestInitiatedBy: input.requestInitiatedBy } : {}),
      },
      accommodationData: input.hotels.map((h, hi) => ({
        licenseNo: h.licenseNo,
        hotelClassification: String(h.stars),
        checkInDate: h.checkIn,
        checkOutDate: h.checkOut,
        city: lookupId(city, getSaudiCity(h.city)?.mtCityCode ?? h.city),
        hotelPrice: money(share.hotelPrices[hi]),
      })),
      arrivalAndDepartureData: {
        arrivalTicketNo: input.ticketNos[outboundIdx],
        arrivalFlightDate: outbound.arriveAt.slice(0, 10),
        arrivalFlightTime: outbound.arriveAt.slice(11, 16),
        arrivalCarrier: outbound.carrierNameEn,
        entryPort: lookupId(entry, outbound.to),
        entryFlightNo: outbound.flightNo,
        returnTicketNo: input.ticketNos[returnIdx],
        departureDate: ret.departAt.slice(0, 10),
        departureTime: ret.departAt.slice(11, 16),
        departureCarrier: ret.carrierNameEn,
        exitPort: lookupId(exit, ret.from),
        departureFlightNo: ret.flightNo,
        flightPrice: money(share.flightPrice),
      },
      insuranceQuestionnaireData: {
        question1: t.insurance.question1 || "false",
        question2: t.insurance.question2 || "false",
        question3: t.insurance.question3 || "false",
        question4: t.insurance.question4 || "false",
        question5: t.insurance.question5 || "false",
        question6: t.insurance.question4 === "true" || t.insurance.question5 === "true" ? t.insurance.question6 : "0",
      },
      mofaQuestionnaireData: {
        moneyLaunderingOffence: clar(t.security.moneyLaunderingOffence),
        servedJailTime: clar(t.security.servedJailTime),
        servedInMilitary: clar(t.security.servedInMilitary),
        workedInPoliticsOrMedia: clar(t.security.workedInPoliticsOrMedia),
        joinedOrganizationOrParty: clar(t.security.joinedOrganizationOrParty),
        beenDeported: t.security.beenDeported,
        crimeFromInterpool: t.security.crimeFromInterpool,
        passportRestricted: t.security.passportRestricted,
        passportImage: b64(t.passportImage),
        entryType: "Single",
        mobileNo: t.mobileNo.replace(/[\s-]/g, ""),
      },
      ...mapActivities(input.activities, city),
    };
    return {
      dmcId: mtConfig().dmcId || "SANDBOX-DMC",
      messageId: input.messageId,
      applicationNoList: input.applicationNos,
      isResubmission: "false",
      visitorData: [visitor],
    };
  });
}

function clar(a: Traveller["security"]["moneyLaunderingOffence"]) {
  return { answer: a.answer as "true" | "false", clarification: a.answer === "true" ? a.clarification.trim() : null };
}

function mapActivities(activities: ActivityOffer[], cityLookup: Awaited<ReturnType<MtClient["getLookup"]>>) {
  const cityId = (code: string) => lookupId(cityLookup, getSaudiCity(code)?.mtCityCode ?? code);
  const ticket = (a: ActivityOffer) => ({
    id: `TKT-${a.id.slice(-12)}`,
    title: a.titleEn,
    price: money(a.pricePerPersonSAR),
    vat: money(a.vatSAR),
    serviceCharge: money(a.serviceChargeSAR),
    grandTotal: money(a.totalSAR),
    currency: "SAR",
    qty: String(a.partySize),
    timeSlots: { id: `TS-${a.id.slice(-12)}`, date: a.date, timeFrom: a.timeFrom, timeTo: a.timeTo },
  });
  const events = activities.filter((a) => a.kind === "event");
  const tours = activities.filter((a) => a.kind === "tour");
  const restaurants = activities.filter((a) => a.kind === "restaurant");
  return {
    ...(tours.length && {
      accompanyingServicesData: tours.map((a) => ({
        serviceType: "3", // Touring
        serviceProvider: a.agentNameEn,
        startDate: a.date,
        endDate: a.date,
        duration: "1",
        serviceDetails: a.titleEn,
        servicePrice: money(a.totalSAR),
      })),
    }),
    ...(events.length && {
      eventData: events.map((a) => ({
        event: {
          id: a.id,
          title: a.titleEn,
          startDateTime: `${a.date} ${a.timeFrom}:00`,
          endDateTime: `${a.date} ${a.timeTo}:00`,
          status: "Confirmed",
          venue: { name: a.venueEn, city: cityId(a.city), country: "SA" },
        },
        tickets: [ticket(a)],
      })),
    }),
    ...(restaurants.length && {
      restaurantData: restaurants.map((a) => ({
        restaurants: {
          bookingId: a.id,
          restaurantName: a.venueEn,
          startDateTime: `${a.date} ${a.timeFrom}:00`,
          endDateTime: `${a.date} ${a.timeTo}:00`,
          city: cityId(a.city),
        },
        restaurantBookingDetail: { partySize: String(a.partySize), time: a.timeFrom },
        tickets: [ticket(a)],
      })),
    }),
  };
}
