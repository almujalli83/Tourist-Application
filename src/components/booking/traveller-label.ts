import { fmt, type Dictionary } from "@/i18n";
import type { Traveller } from "@/lib/types";

/** "Adult" for 18+, otherwise the minor's category and the age chosen in the search. */
export function travellerTypeLabel(t: Dictionary, x: Pick<Traveller, "paxType" | "declaredAge">): string {
  const age = x.declaredAge;
  if (age === null || age === undefined) return x.paxType === "adult" ? t.common.adult : t.common[x.paxType];
  const kind = age < 2 ? t.common.infant : age < 12 ? t.common.child : t.common.minor;
  return `${kind} (${ageLabel(t, age)})`;
}

/** A child's age: "under 1", then Arabic-aware plurals (سنة واحدة، سنتان، 3–10 سنوات، 11+ سنة). */
export function ageLabel(t: Dictionary, age: number): string {
  const g = t.search.guests;
  if (age === 0) return g.underOne;
  if (age === 1) return g.yearOne;
  if (age === 2) return g.yearsTwo;
  return fmt(age <= 10 ? g.yearsFew : g.years, { n: age });
}
