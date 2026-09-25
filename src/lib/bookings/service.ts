import { randomInt, randomUUID } from "node:crypto";
import { paxKey } from "../agents/aggregator";
import { verifyOffer } from "../agents/offer-signing";
import type { PublicUser } from "../auth/types";
import { VISA_INSURANCE_FEE_SAR } from "../config";
import { getBookingForUser, listBookingsByUser, saveBooking, updateBooking } from "../repo";
import { todayISO } from "../dates";
import { buildLegs, stayDates, validateCriteria } from "../itinerary";
import { getMtClient, mtIsOk } from "../mt-evisa/client";
import { buildSubmitRequests } from "../mt-evisa/mapper";
import { checkPackageRequirements } from "../package-rules";
import { chargeCard, type CardInput } from "../payment";
import { computePackagePrice } from "../pricing";
import type { ActivityOffer, BookingSelection, FlightOffer, HotelOffer, Traveller } from "../types";
import { validatePackageComposition, validateTraveller } from "../visa-validation";
import type { StoredApplicant, StoredBooking } from "./types";

export class BookingError extends Error {
  constructor(public code: string, public details?: unknown) {
    super(code);
  }
}

export interface CreateBookingInput {
  selection: BookingSelection;
  travellers: Traveller[];
  disclaimerAccepted: boolean;
  expectedTotalSAR: number;
  displayCurrency: string;
  clientReference?: string;
  card: CardInput;
}

/** Numeric application number (STP015: numbers only). */
function applicationNo(): string {
  const d = new Date();
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `${stamp}${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
}

function bookingReference(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return `TA-${Array.from({ length: 8 }, () => alphabet[randomInt(0, alphabet.length)]).join("")}`;
}

/**
 * Validates the selected offers: each must carry a valid, unexpired server signature and
 * match the itinerary and traveller mix, so client-side prices cannot be tampered with.
 */
export function resolveSelection(sel: BookingSelection) {
  const legs = buildLegs(sel.criteria);
  const stays = stayDates(sel.criteria);
  const pax = paxKey(sel.criteria.pax);
  const travellerCount = sel.criteria.pax.adults + sel.criteria.pax.children + sel.criteria.pax.infants;
  const offers = sel.offers ?? { flights: [], hotels: [], activities: [] };
  const pick = <T extends { id: string }>(list: T[] | undefined, id: string | undefined) => (id ? (list ?? []).find((o) => o.id === id) : undefined);

  const flights = legs.map((leg) => {
    const o = pick<FlightOffer>(offers.flights, sel.flights[leg.index]);
    if (!o || !verifyOffer(o) || o.legIndex !== leg.index || o.from !== leg.from || o.to !== leg.to || !o.departAt.startsWith(leg.date))
      throw new BookingError("offerExpired");
    return o;
  });
  const hotels = stays.map((st) => {
    const o = pick<HotelOffer>(offers.hotels, sel.hotels[st.city]);
    if (!o || !verifyOffer(o) || o.city !== st.city || o.checkIn !== st.checkIn || o.checkOut !== st.checkOut || o.forPax !== pax)
      throw new BookingError("offerExpired");
    return o;
  });
  const activities = [...new Set(sel.activities)].map((id) => {
    const o = pick<ActivityOffer>(offers.activities, id);
    if (!o || !verifyOffer(o) || o.forPax !== pax || !stays.some((st) => st.city === o.city)) throw new BookingError("offerExpired");
    // Activity tickets are bought for every traveller in the package.
    if (o.partySize !== travellerCount) throw new BookingError("offerExpired");
    return o;
  });
  const price = computePackagePrice({ pax: sel.criteria.pax, flights, hotels, activities, visaFeeSAR: VISA_INSURANCE_FEE_SAR });
  return { flights, hotels, activities, price };
}

/**
 * Server-side check of the key package requirements on the signed offers. Until the travellers'
 * dates of birth are known, adults are counted from the search.
 */
export function evaluatePackage(sel: BookingSelection, travellers?: Pick<Traveller, "birthDate">[]) {
  const criteriaErrors = validateCriteria(sel.criteria, todayISO());
  if (criteriaErrors.length) throw new BookingError("invalidCriteria", criteriaErrors);
  const { flights, hotels, price } = resolveSelection(sel);
  return checkPackageRequirements({
    criteria: sel.criteria,
    flights,
    hotels,
    totalSAR: price.totalSAR,
    today: todayISO(),
    travellers,
    arrivalDate: flights[0]?.arriveAt.slice(0, 10),
  });
}

export async function createBooking(user: PublicUser, input: CreateBookingInput): Promise<StoredBooking> {
  const { selection, travellers } = input;
  const today = todayISO();
  const criteriaErrors = validateCriteria(selection.criteria, today);
  if (criteriaErrors.length) throw new BookingError("invalidCriteria", criteriaErrors);
  if (!input.disclaimerAccepted) throw new BookingError("disclaimerRequired");

  const { pax } = selection.criteria;
  const expectedTypes = [
    ...Array(pax.adults).fill("adult"),
    ...Array(pax.children).fill("child"),
    ...Array(pax.infants).fill("infant"),
  ];
  if (travellers.length !== expectedTypes.length || travellers.some((t, i) => t.paxType !== expectedTypes[i]))
    throw new BookingError("travellerMismatch");

  const { flights, hotels, activities, price } = resolveSelection(selection);
  const arrivalDate = flights[0].arriveAt.slice(0, 10);
  const ctx = { arrivalDate, returnDate: selection.criteria.returnDate, today, travellerCount: travellers.length };
  const fieldErrors = travellers.map((t, i) => validateTraveller(t, i, travellers, ctx));
  if (fieldErrors.some((e) => Object.keys(e).length)) throw new BookingError("invalidTravellers", fieldErrors);
  const composition = validatePackageComposition(travellers, arrivalDate);
  if (composition.errors.length) throw new BookingError("invalidComposition", composition.errors);

  // Key package requirements, with the minimum price counted on the travellers' actual ages.
  const rules = checkPackageRequirements({ criteria: selection.criteria, flights, hotels, totalSAR: price.totalSAR, today, travellers, arrivalDate });
  if (!rules.ok) throw new BookingError("packageRequirements", rules.checks.filter((c) => !c.ok).map((c) => c.id));

  if (Math.abs(price.totalSAR - input.expectedTotalSAR) > 0.009) throw new BookingError("priceChanged", price);

  const payment = await chargeCard(input.card, price.totalSAR);
  if (!payment.ok) throw new BookingError(`payment_${payment.code}`);

  const client = getMtClient();
  const messageId = randomUUID();
  const applicationNos = travellers.map(() => applicationNo());
  const ticketNos = flights.map(() => `ETKT${randomInt(100000, 999999)}${randomInt(1000, 9999)}`);
  const requests = await buildSubmitRequests(client, {
    messageId,
    applicationNos,
    travellers,
    flights,
    hotels,
    activities,
    ticketNos,
    purchaseDate: today,
    departureDate: selection.criteria.departureDate,
    returnDate: selection.criteria.returnDate,
    visaFeeSAR: price.visaFeePerTravellerSAR,
    requestInitiatedBy: user.accountType === "company" ? user.company?.companyName : undefined,
  });

  // Submit one applicant at a time; sponsors (no companion) first so dependents can reference them.
  const order = travellers.map((t, i) => i).sort((a, b) => Number(travellers[a].sponsorIndex !== null) - Number(travellers[b].sponsorIndex !== null));
  const applicants: StoredApplicant[] = travellers.map((t, i) => ({
    applicationNo: applicationNos[i],
    paxType: t.paxType,
    nameEn: [t.firstNameEn, t.familyNameEn].join(" ").trim(),
    nationality: t.nationality,
    passportNo: t.passportNo.toUpperCase(),
    email: t.email,
    sponsorApplicationNo: t.sponsorIndex !== null ? applicationNos[t.sponsorIndex] : null,
    submission: null,
    appStatus: null,
    visaNumber: null,
    visaIssueDate: null,
    visaExpiryDate: null,
    visaStatus: null,
    insuranceStatus: null,
  }));
  let packageId: string | null = null;
  for (const i of order) {
    const req = requests[i];
    try {
      const res = await client.submitTourismPackage(req);
      const ok = mtIsOk(res.errorCodes);
      if (ok && res.packageId) packageId = res.packageId;
      applicants[i].submission = {
        ok,
        errors: (res.applicationStatus ?? []).map((e) => ({ code: e.errorCode, message: e.errorMessage })),
        submittedAt: new Date().toISOString(),
      };
      if (!ok && !res.applicationStatus?.length)
        applicants[i].submission!.errors = res.errorCodes.map((c) => ({ code: c, message: "" }));
    } catch (err) {
      applicants[i].submission = {
        ok: false,
        errors: [{ code: "NETWORK", message: (err as Error).message }],
        submittedAt: new Date().toISOString(),
      };
    }
  }

  const allOk = applicants.every((a) => a.submission?.ok);
  const booking: StoredBooking = {
    id: randomUUID(),
    reference: bookingReference(),
    userId: user.id,
    accountType: user.accountType,
    clientReference: input.clientReference?.trim() || null,
    createdAt: new Date().toISOString(),
    criteria: selection.criteria,
    flights,
    hotels,
    activities,
    price,
    displayCurrency: input.displayCurrency,
    payment: { transactionId: payment.transactionId, method: payment.method, last4: payment.last4, amountSAR: price.totalSAR, paidAt: new Date().toISOString() },
    status: allOk ? "SUBMITTED" : "SUBMISSION_FAILED",
    mt: { mode: client.mode, messageId, packageId, packageStatus: allOk ? "RECEIVED" : null, lastCheckedAt: null },
    applicants,
  };
  // Passport images and photos are sent to MT only and are not retained.
  await saveBooking(booking);
  return booking;
}

export function listBookings(userId: string): Promise<StoredBooking[]> {
  return listBookingsByUser(userId);
}

export async function getBooking(userId: string, id: string): Promise<StoredBooking | undefined> {
  return (await getBookingForUser(userId, id)) ?? undefined;
}

/** Pulls the latest package status from MT (getTourismPackageStatus) and stores it. */
export async function refreshBookingStatus(userId: string, id: string): Promise<StoredBooking | undefined> {
  const booking = await getBooking(userId, id);
  if (!booking?.mt.packageId) return booking;
  const res = await getMtClient().getTourismPackageStatus(booking.mt.packageId);
  if (!mtIsOk(res.errorCodes)) return booking;
  const updated = await updateBooking(id, (b) => {
    b.mt.packageStatus = res.tourismPackageStatus ?? b.mt.packageStatus;
    b.mt.lastCheckedAt = new Date().toISOString();
    for (const t of res.travellerList ?? []) {
      const a = b.applicants.find((x) => x.applicationNo === t.applicationNo);
      if (!a) continue;
      Object.assign(a, {
        appStatus: t.appStatus,
        visaNumber: t.visaNumber,
        visaIssueDate: t.visaIssueDate,
        visaExpiryDate: t.visaExpiryDate,
        visaStatus: t.visaStatus,
        insuranceStatus: t.insuranceStatus,
      });
    }
    if (b.mt.packageStatus === "COMPLETED") b.status = "COMPLETED";
    if (b.mt.packageStatus === "CANCELLED") b.status = "CANCELLED";
    return b;
  });
  return updated ?? undefined;
}
