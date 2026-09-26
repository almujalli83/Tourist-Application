/**
 * «My bookings»: groups each package with the bookings made for that trip — those dated within
 * its arrival and departure days, and eSIMs bought with it. Cancelled packages don't group.
 */
export interface Groupable {
  kind: string;
  id: string;
  /** Saudi calendar day of the booking (YYYY-MM-DD). */
  day: string;
  at: number;
  /** Packages: the trip's dates. */
  trip?: { from: string; to: string; cancelled: boolean };
  /** eSIMs bought with a package: its id. */
  packageId?: string;
}

export function groupByTrip<T extends Groupable>(items: T[]): { item: T; children: T[] }[] {
  const trips = items.filter((i) => i.kind === "package" && i.trip && !i.trip.cancelled).sort((a, b) => a.at - b.at);
  const children = new Map<string, T[]>(trips.map((t) => [t.id, []]));
  const attached = new Set<T>();
  for (const i of items) {
    if (i.kind === "package") continue;
    const trip = i.packageId && children.has(i.packageId)
      ? trips.find((t) => t.id === i.packageId)
      : i.kind !== "esim" ? trips.find((t) => i.day >= t.trip!.from && i.day <= t.trip!.to) : undefined;
    if (!trip) continue;
    children.get(trip.id)!.push(i);
    attached.add(i);
  }
  return items.filter((i) => !attached.has(i)).map((item) => ({ item, children: (children.get(item.id) ?? []).sort((a, b) => a.at - b.at) }));
}
