import type { Traveller } from "@/lib/types";
import { emptyTraveller } from "@/lib/visa-validation";

const JPEG_20KB = `data:image/jpeg;base64,${"A".repeat(27_000)}`;

export function validAdult(overrides: Partial<Traveller> = {}): Traveller {
  const t = emptyTraveller("adult", "IN");
  const no = { answer: "false" as const, clarification: "" };
  return {
    ...t,
    firstNameEn: "FARAZ", familyNameEn: "MOHAMMAD", birthDate: "1990-01-27", birthplace: "IN", gender: "1", job: "Business",
    passportNo: "G88201134H", passportIssueDate: "2024-03-11", passportExpiryDate: "2034-03-10", passportIssuePlace: "IN",
    religion: "1", maritalStatus: "2", email: "faraz@example.com", mobileNo: "+918756901224",
    personPhoto: JPEG_20KB, passportImage: JPEG_20KB,
    security: {
      moneyLaunderingOffence: no, servedJailTime: no, servedInMilitary: no, workedInPoliticsOrMedia: no, joinedOrganizationOrParty: no,
      beenDeported: "false", crimeFromInterpool: "false", passportRestricted: "false",
    },
    insurance: { question1: "false", question2: "false", question3: "false", question4: "", question5: "", question6: "0" },
    ...overrides,
  };
}
