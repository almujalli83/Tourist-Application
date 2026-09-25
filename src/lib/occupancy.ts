/**
 * Guests and rooms chosen in the search: adults (18+) and each child's age (0–17) per room.
 * Ages give the airline fare category of every traveller and the package's adults and minors.
 */
import { PACKAGE_LIMITS } from "./config";
import type { PaxCount, PaxType, RoomOccupancy } from "./types";

export const ROOM_LIMITS = { maxRooms: 9, maxAdultsPerRoom: 4, maxChildrenPerRoom: 4, maxChildAge: 17 } as const;

/** Airline fare category for a minor's age: infant under 2, child 2–11, adult fare from 12. */
export function fareTypeForAge(age: number): PaxType {
  return age < 2 ? "infant" : age < 12 ? "child" : "adult";
}

export const adultsOf = (rooms: RoomOccupancy[]) => rooms.reduce((a, r) => a + r.adults, 0);
export const minorsOf = (rooms: RoomOccupancy[]) => rooms.reduce((a, r) => a + r.childAges.length, 0);
export const travellersOf = (rooms: RoomOccupancy[]) => adultsOf(rooms) + minorsOf(rooms);

/** Fare categories for flight pricing. */
export function paxFromRooms(rooms: RoomOccupancy[]): PaxCount {
  const ages = rooms.flatMap((r) => r.childAges);
  return {
    adults: adultsOf(rooms) + ages.filter((a) => fareTypeForAge(a) === "adult").length,
    children: ages.filter((a) => fareTypeForAge(a) === "child").length,
    infants: ages.filter((a) => fareTypeForAge(a) === "infant").length,
  };
}

/**
 * The travellers of the package in form order: adults (18+), then minors from oldest to
 * youngest — which keeps fare categories grouped as adult, child, infant.
 */
export function expectedTravellers(rooms: RoomOccupancy[]): { paxType: PaxType; declaredAge: number | null }[] {
  const adults = Array.from({ length: adultsOf(rooms) }, () => ({ paxType: "adult" as PaxType, declaredAge: null }));
  const minors = rooms
    .flatMap((r) => r.childAges)
    .sort((a, b) => b - a)
    .map((age) => ({ paxType: fareTypeForAge(age), declaredAge: age as number | null }));
  return [...adults, ...minors];
}

/** Key binding a hotel quote to the exact rooms and guests it was priced for. */
export function occupancyKey(rooms: RoomOccupancy[]): string {
  return rooms.map((r) => `${r.adults}a${r.childAges.length ? `-${r.childAges.join(".")}` : ""}`).join("_");
}

export type OccupancyError = "rooms" | "childAges" | "maxAdults" | "maxMinors" | "infants";

export function validateRooms(rooms: RoomOccupancy[] | undefined): OccupancyError[] {
  if (!Array.isArray(rooms) || rooms.length < 1 || rooms.length > ROOM_LIMITS.maxRooms) return ["rooms"];
  const errors = new Set<OccupancyError>();
  for (const r of rooms) {
    if (!Number.isInteger(r?.adults) || r.adults < 1 || r.adults > ROOM_LIMITS.maxAdultsPerRoom) errors.add("rooms");
    if (!Array.isArray(r?.childAges) || r.childAges.length > ROOM_LIMITS.maxChildrenPerRoom) errors.add("rooms");
    else if (r.childAges.some((a) => !Number.isInteger(a) || a < 0 || a > ROOM_LIMITS.maxChildAge)) errors.add("childAges");
  }
  if (errors.size) return [...errors];
  if (adultsOf(rooms) > PACKAGE_LIMITS.maxAdults) errors.add("maxAdults");
  if (minorsOf(rooms) > PACKAGE_LIMITS.maxMinors) errors.add("maxMinors");
  const pax = paxFromRooms(rooms);
  if (pax.infants > pax.adults) errors.add("infants");
  return [...errors];
}
