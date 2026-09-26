import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicUser } from "@/lib/auth/types";
import type { StoredBooking } from "@/lib/bookings/types";
import { emergencyContext } from "@/lib/emergency/context";
import { EMERGENCY_NUMBERS, PHRASES } from "@/lib/emergency/data";
import { nearbyPlaces, reverseAddress } from "@/lib/emergency/nearby";
import { saveBooking } from "@/lib/repo";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.EMERGENCY_OSM;
  delete process.env.DEMO_EMERGENCY;
});

describe("emergency service", () => {
  it("lists the official emergency numbers with 911 first", () => {
    expect(EMERGENCY_NUMBERS[0]).toMatchObject({ id: "unified", number: "911", primary: true });
    expect(Object.fromEntries(EMERGENCY_NUMBERS.map((n) => [n.id, n.number]))).toEqual({
      unified: "911", ambulance: "997", police: "999", civilDefense: "998", traffic: "993", highway: "996", health: "937",
    });
    expect(PHRASES.every((p) => p.ar && p.en && p.say)).toBe(true);
  });

  it("finds the nearest hospitals (emergency departments first), pharmacies and police from OpenStreetMap", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      elements: [
        { type: "node", id: 1, lat: 24.72, lon: 46.68, tags: { amenity: "hospital", name: "مستشفى قريب" } },
        { type: "way", id: 2, center: { lat: 24.75, lon: 46.70 }, tags: { amenity: "hospital", "name:en": "City Hospital", emergency: "yes", phone: "+966 11 000 0000;+966 11 111 1111" } },
        { type: "node", id: 3, lat: 24.714, lon: 46.676, tags: { amenity: "hospital" } },
      ],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const list = await nearbyPlaces("hospital", 24.7136, 46.6753);
    expect(list.map((h) => h.id)).toEqual(["osm:way/2", "osm:node/1"]); // unnamed dropped, ER first
    expect(list[0]).toMatchObject({ emergency: true, phone: "+966 11 000 0000", nameEn: "City Hospital" });
    // Cached per area.
    await nearbyPlaces("hospital", 24.7137, 46.6754);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    process.env.EMERGENCY_OSM = "off";
    expect(await nearbyPlaces("pharmacy", 24.7136, 46.6753)).toEqual([]);
    expect(await reverseAddress(24.7136, 46.6753, "ar")).toBeNull();
  });

  it("returns an empty list when OpenStreetMap is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await nearbyPlaces("police", 21.5, 39.2)).toEqual([]);
  });

  it("shows the medical insurance of the current or next trip and the traveller's nationality", async () => {
    const user = { id: "em-u1", email: "em@example.com", accountType: "individual", preferredLocale: "ar", preferredCurrency: "SAR", createdAt: "", individual: { fullName: "A B", phone: "", nationality: "EG" } } as PublicUser;
    const booking = (id: string, dep: string, ret: string) => ({
      id, reference: `TA-${id}`, userId: user.id, createdAt: `${dep}T00:00:00Z`, status: "COMPLETED", mt: { packageStatus: "COMPLETED" },
      criteria: { departureDate: dep, returnDate: ret, nationality: "EG", stays: [] },
      applicants: [{ nameEn: "AHMED ALI", insuranceStatus: "ISSUED" }, { nameEn: "SARA ALI", insuranceStatus: null }],
    }) as unknown as StoredBooking;
    await saveBooking(booking("old", "2026-01-01", "2026-01-05"));
    await saveBooking(booking("next", "2026-10-10", "2026-10-16"));
    const ctx = await emergencyContext(user, new Date("2026-10-01T09:00:00Z"));
    expect(ctx).toMatchObject({ demo: true, nationality: "EG", insurance: { reference: "TA-next" } });
    expect(ctx.insurance!.travellers).toEqual([{ name: "AHMED ALI", issued: true }, { name: "SARA ALI", issued: false }]);
    expect((await emergencyContext(null)).insurance).toBeNull();
    process.env.DEMO_EMERGENCY = "off";
    expect((await emergencyContext(null)).demo).toBe(false);
  });
});
