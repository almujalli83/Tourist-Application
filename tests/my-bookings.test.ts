import { describe, expect, it } from "vitest";
import { groupByTrip } from "@/lib/account/trips";

const at = (d: string) => Date.parse(`${d}T12:00:00Z`);
const pkg = (id: string, from: string, to: string, cancelled = false) => ({ kind: "package", id, day: from, at: at(from), trip: { from, to, cancelled } });
const item = (kind: string, id: string, day: string, packageId?: string) => ({ kind, id, day, at: at(day), packageId });

describe("My bookings grouped by trip", () => {
  it("puts the trip's tickets, tables and eSIMs under its package, and keeps the rest on their own", () => {
    const rows = [
      pkg("p1", "2026-10-08", "2026-10-11"),
      pkg("p2", "2026-12-01", "2026-12-05", true),
      item("event", "e1", "2026-10-09"),
      item("table", "t1", "2026-10-08"),
      item("train", "r1", "2026-10-20"),
      item("esim", "s1", "2026-09-26", "p1"),
      item("esim", "s2", "2026-10-09"),
      item("event", "e2", "2026-12-02"),
    ];
    const out = groupByTrip(rows);
    const p1 = out.find((e) => e.item.id === "p1")!;
    expect(p1.children.map((c) => c.id)).toEqual(["s1", "t1", "e1"]);
    // Standalone: a later train, an eSIM not bought with the package, bookings during a cancelled trip.
    expect(out.map((e) => e.item.id).sort()).toEqual(["e2", "p1", "p2", "r1", "s2"]);
    expect(out.find((e) => e.item.id === "p2")!.children).toEqual([]);
  });
});
