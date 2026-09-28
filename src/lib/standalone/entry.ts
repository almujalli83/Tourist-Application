/**
 * How the traveller enters (or lives in) the Kingdom, for bookings made without a tourism package.
 * It decides which travel documents a flight accepts and adds the stopover rules; no visa is
 * applied for here.
 */
export const ENTRY_TYPES = ["evisa", "arrival", "stopover", "gcc", "resident", "citizen"] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];
export const isEntryType = (v: unknown): v is EntryType => typeof v === "string" && (ENTRY_TYPES as readonly string[]).includes(v);

/** The stopover visa: up to 96 hours in the Kingdom between two flights with Saudia or flynas. */
export const STOPOVER = { maxHours: 96, carriers: ["SV", "XY"], maxNights: 4 } as const;

export type DocType = "passport" | "nationalId" | "iqama";

/** Documents a passenger may travel with: passports everywhere; a Saudi ID or iqama on domestic flights. */
export function docTypesFor(domestic: boolean): DocType[] {
  return domestic ? ["passport", "nationalId", "iqama"] : ["passport"];
}

export function validDocNo(type: DocType, no: string, nationality: string): boolean {
  if (type === "nationalId") return nationality === "SA" && /^1\d{9}$/.test(no);
  if (type === "iqama") return nationality !== "SA" && /^2\d{9}$/.test(no);
  return /^[A-Z0-9]{5,15}$/.test(no);
}

/** Stopover rules for an arrival and an onward flight (local times in the Kingdom). */
export function stopoverProblem(arrive: { arriveAt: string; carrierCode: string }, onward: { departAt: string; carrierCode: string }): string | null {
  if (!STOPOVER.carriers.includes(arrive.carrierCode as "SV") || !STOPOVER.carriers.includes(onward.carrierCode as "SV")) return "stopoverCarrier";
  const hours = (Date.parse(`${onward.departAt}:00+03:00`) - Date.parse(`${arrive.arriveAt}:00+03:00`)) / 3_600_000;
  if (hours < 2) return "connectionTooShort";
  if (hours > STOPOVER.maxHours) return "stopoverTooLong";
  return null;
}
