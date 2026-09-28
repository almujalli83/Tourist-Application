/** Client-safe checks of a tourist eVisa application (the page shows the same errors the server returns). */
import { todayISO } from "../dates";
import { getCountry } from "../data/countries";
import type { Traveller } from "../types";
import { validatePackageComposition, validateTraveller, type FieldErrors } from "../visa-validation";
import { evisaEligible } from "./eligibility";

/**
 * Checks the travellers as a package's visa request does, plus the nationality: returns the field
 * errors per traveller (empty when all is well) and the group's composition problems.
 */
export function validateEvisaTravellers(travellers: Traveller[], arrivalDate: string, today = todayISO()) {
  const ctx = { arrivalDate, returnDate: arrivalDate, today, travellerCount: travellers.length };
  const list = travellers.map((t) => ({ ...t, declaredAge: undefined }));
  const errors: FieldErrors[] = list.map((t, i) => {
    const e = validateTraveller(t, i, list, ctx);
    if (getCountry(t.nationality) && !evisaEligible(t.nationality)) e.nationality = "evisaNotEligible";
    return e;
  });
  return { errors, composition: validatePackageComposition(list, arrivalDate).errors };
}

