/** Types for the MT (Ministry of Tourism) OTA eVisa Integration APIs — guide v1.7. */

export interface MtLookupItem {
  id: string;
  code: string;
  enValue: string;
}

export interface MtLookupResponse {
  correlationId: string;
  errorCodes?: string[];
  errorCode?: string[];
  data?: MtLookupItem[];
}

export type MtLookupName =
  | "getbirthPlace"
  | "getCompanionType"
  | "getNationality"
  | "getPassportIssuePlace"
  | "getCity"
  | "getEntryPort"
  | "getExitPort";

export interface MtClarified {
  answer: "true" | "false";
  clarification: string | null;
}

export interface MtVisitorData {
  applicationNo: string;
  firstNameAr: string | null;
  middleNameAr: string | null;
  grandFatherNameAr: string | null;
  familyNameAr: string | null;
  firstNameEn: string;
  middleNameEn: string | null;
  grandFatherNameEn: string | null;
  familyNameEn: string;
  birthDate: string;
  birthplace: string;
  gender: "1" | "2";
  job: string;
  nationality: string;
  passportIssueDate: string;
  passportExpiryDate: string;
  passportIssuePlace: string;
  passportNo: string;
  passportType: string;
  personPhoto: string;
  religion: string;
  maritalStatus: string;
  zipCode: string | null;
  email: string;
  companionType: string | null;
  companionApplicationNo: string | null;
  disclaimerAnswered: "Yes";
  generalPackageData: {
    purpose: "Tourism";
    packagePurchaseDate: string;
    totalPackagePrice: string;
    packageDuration: string;
    requestInitiatedBy?: string;
  };
  accommodationData: {
    licenseNo: string;
    hotelClassification: string;
    checkInDate: string;
    checkOutDate: string;
    city: string;
    hotelPrice: string;
  }[];
  arrivalAndDepartureData: {
    arrivalTicketNo: string;
    arrivalFlightDate: string;
    arrivalFlightTime: string;
    arrivalCarrier: string;
    entryPort: string;
    entryFlightNo: string;
    returnTicketNo: string;
    departureDate: string;
    departureTime: string;
    departureCarrier: string;
    exitPort: string;
    departureFlightNo: string;
    flightPrice: string;
  };
  insuranceQuestionnaireData: {
    question1: string;
    question2: string;
    question3: string;
    question4: string;
    question5: string;
    question6: string;
  };
  mofaQuestionnaireData: {
    moneyLaunderingOffence: MtClarified;
    servedJailTime: MtClarified;
    servedInMilitary: MtClarified;
    workedInPoliticsOrMedia: MtClarified;
    joinedOrganizationOrParty: MtClarified;
    beenDeported: string;
    crimeFromInterpool: string;
    passportRestricted: string;
    passportImage: string;
    entryType: "Single";
    mobileNo: string;
  };
  accompanyingServicesData?: {
    serviceType: string;
    serviceProvider: string;
    transporter?: string;
    transportationDetails?: string;
    startDate: string;
    endDate: string;
    duration: string;
    serviceDetails: string;
    servicePrice: string;
  }[];
  eventData?: unknown[];
  restaurantData?: unknown[];
}

export interface SubmitTourismPackageRequest {
  dmcId: string;
  packageId?: string;
  messageId: string;
  applicationNoList: string[];
  isResubmission: "true" | "false";
  visitorData: [MtVisitorData];
}

/** updateTravellerTravelDetails (§8): new travel details of one visa-granted applicant. */
export interface UpdateTravelDetailsRequest {
  dmcId: string;
  packageId: string;
  messageId: string;
  visitorData: {
    applicationNo: string;
    generalPackageData: MtVisitorData["generalPackageData"];
    arrivalAndDepartureData: MtVisitorData["arrivalAndDepartureData"];
    accommodationData: MtVisitorData["accommodationData"];
  };
}

export interface UpdateTravelDetailsResponse {
  correlationId: string;
  errorCodes: string[];
}

export interface SubmitTourismPackageResponse {
  correlationId: string;
  packageId?: string;
  applicationNo?: string;
  applicationStatus?: { errorCode: string; errorMessage: string }[];
  errorCodes: string[];
}

export interface MtTraveller {
  applicationNo: string;
  name: string;
  countryId: string;
  passportNo: string;
  visaNumber: string | null;
  visaIssueDate: string | null;
  visaExpiryDate: string | null;
  appValidationError: (string | number)[];
  appStatus: string;
  visaStatus: string | null;
  insuranceStatus: string | null;
  travelHistoryList?: { entryDate: string; exitDate: string }[];
}

export interface PackageStatusResponse {
  correlationId: string;
  packageId: string;
  tourismPackageStatus?: string;
  tourismPackageErrorCode?: string;
  pendingApplications?: string[];
  travellerList?: MtTraveller[];
  errorCodes: string[];
}

export interface PrivacyPolicyResponse {
  correlationId: string;
  privacyPolicyAr: { policyId: string; policyDetails: string }[];
  acknowledgementAr: { acknowledgmentId: string; acknowledgmentDetails: string }[];
  disclaimerAr: string;
  privacyPolicyEn: { policyId: string; policyDetails: string }[];
  acknowledgementEn: { acknowledgmentId: string; acknowledgmentDetails: string }[];
  disclaimerEn: string;
  errorCodes?: string[];
}

/** Package processing statuses (§10.2). */
export const PACKAGE_STATUSES = [
  "PARTIALLY_RECEIVED", "RECEIVED", "VALIDATION_PASSED", "VALIDATION_FAILED", "PAYMENT_INITIATED",
  "PAYMENT_FAILED", "PAYMENT_COMPLETED", "PROCESSING", "CORRECTION_REQUIRED", "PARTIAL_APPROVAL",
  "REJECTED", "COMPLETED", "CANCELLED",
] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];
