import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }), headers: async () => new Headers() }));

import { randomUUID } from "node:crypto";
import type { StoredUser } from "@/lib/auth/types";
import type { StoredBooking } from "@/lib/bookings/types";
import {
  acceptInvite, createFamily, deleteFamily, familyOf, familyTraveller, familyTravellers, familyTrips, invitePreview, inviteMember, leaveFamily,
  onAccountDeleted, removeMember, transferHead, updateSharing,
} from "@/lib/family/family";
import { createTripShare, listTripShares, revokeTripShare, sharedTrip } from "@/lib/family/share";
import { listOutbox } from "@/lib/notify";
import { createUser } from "@/lib/repo";
import { createSavedTraveller } from "@/lib/saved-travellers-repo";
import { store } from "@/lib/store";

const req = new Request("http://localhost/api");
const sent: { to: string; text: string }[] = [];
beforeEach(() => {
  sent.length = 0;
  process.env.RESEND_API_KEY = "k";
  process.env.EMAIL_FROM = "a@b.co";
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
    const b = JSON.parse(String(init.body));
    sent.push({ to: b.to[0], text: b.text });
    return new Response("{}");
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
});
const tokenFor = (email: string) => [...sent].reverse().find((m) => m.to === email)?.text.match(/token=([\w-]+)/)?.[1] ?? "";

async function user(name: string): Promise<StoredUser> {
  const id = randomUUID();
  return (await createUser({ id, email: `${name.toLowerCase()}${id.slice(0, 6)}@example.com`, passwordHash: "", accountType: "individual", individual: { fullName: name, phone: "+966500000000", nationality: "SA" }, preferredLocale: "ar", preferredCurrency: "SAR", createdAt: new Date().toISOString() }))!;
}

function booking(userId: string, dep: string, ret: string): StoredBooking {
  const id = randomUUID();
  return {
    id, reference: `TA-${id.slice(0, 6)}`, userId, accountType: "individual", clientReference: null, createdAt: new Date().toISOString(),
    criteria: { origin: "CAI", stays: [{ city: "RUH", nights: 3 }], departureDate: dep, returnDate: ret, rooms: [{ adults: 2, childAges: [] }], pax: { adults: 2, children: 0, infants: 0 }, cabin: "economy", nationality: "EG" },
    flights: [{ kind: "outbound", from: "CAI", to: "RUH", departAt: `${dep}T08:00`, arriveAt: `${dep}T11:00`, flightNo: "SV310", carrierNameAr: "السعودية", carrierNameEn: "Saudia" }],
    hotels: [{ city: "RUH", nameAr: "فندق", nameEn: "Hotel", districtAr: "العليا", districtEn: "Olaya", checkIn: dep, checkOut: ret, lat: 24.7, lng: 46.6 }],
    activities: [], price: { totalSAR: 5000 }, displayCurrency: "SAR", payment: null, status: "COMPLETED",
    mt: { mode: "sandbox", messageId: "m", packageId: "p", packageStatus: "COMPLETED", lastCheckedAt: null },
    applicants: [{ applicationNo: "1", nameEn: "SARA ALI", visaNumber: "601", passportNo: "A123", nationality: "EG" }], ticketNos: [], modifications: [],
  } as unknown as StoredBooking;
}

describe("family", () => {
  it("invites, joins with the invited email only, and shares trips and travellers by choice", async () => {
    const head = await user("Fahad");
    const wife = await user("Noura");
    const stranger = await user("Other");
    const fam = await createFamily(head.id, "عائلة فهد");
    await expect(createFamily(head.id, "again")).rejects.toThrow("alreadyInFamily");
    await expect(inviteMember(wife.id, { email: "x@y.co", name: "x", relation: "son" }, "ar", req)).rejects.toThrow("noFamily");
    await inviteMember(head.id, { email: wife.email, name: "نورة", relation: "spouse" }, "ar", req);
    const token = tokenFor(wife.email);
    expect(token.length).toBeGreaterThan(20);
    expect((await listOutbox()).find((m) => m.to[0] === wife.email)!.text).not.toContain(token);
    expect(await invitePreview(token)).toMatchObject({ familyName: "عائلة فهد", headName: "Fahad", email: wife.email, members: 1 });
    await expect(acceptInvite(stranger.id, token, {})).rejects.toThrow("wrongAccount");
    const joined = await acceptInvite(wife.id, token, { shareTrips: true, shareTravellers: true });
    expect(joined.members.find((m) => m.userId === wife.id)).toMatchObject({ status: "active", shareTravellers: true });
    await expect(acceptInvite(wife.id, token, {})).rejects.toThrow("expired");
    expect(sent.some((m) => m.to === head.email && /joined/.test(m.text))).toBe(true);

    // Travellers the wife shares appear for the head (read-only ids), not for strangers.
    const saved = await createSavedTraveller(wife.id, { firstNameEn: "NOURA", familyNameEn: "ALI", nationality: "SA", passportNo: "P1234567" } as never);
    const list = await familyTravellers(head.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ sharedBy: "Noura" });
    expect(list[0].id).toBe(`fam:${wife.id}:${(saved as { id: string }).id}`);
    expect((await familyTraveller(head.id, list[0].id))?.passportNo).toBe("P1234567");
    expect(await familyTraveller(stranger.id, list[0].id)).toBeNull();
    expect(await familyTravellers(wife.id)).toHaveLength(0); // the head shares none by default? (head shares; has none saved)

    // Trips.
    await store().put("bookings", "b1", booking(wife.id, "2099-03-01", "2099-03-05"));
    const trips = await familyTrips(head.id);
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({ memberName: "Noura", mine: false, cities: ["RUH"] });
    await updateSharing(wife.id, { shareTrips: false, shareTravellers: false });
    expect(await familyTrips(head.id)).toHaveLength(0);
    expect(await familyTrips(wife.id)).toHaveLength(1); // always sees her own
    expect(await familyTravellers(head.id)).toHaveLength(0);

    // Leaving, removing, handing over, deleting.
    await expect(leaveFamily(head.id)).rejects.toThrow("headCannotLeave");
    const sonUser = await user("Saad");
    await inviteMember(head.id, { email: sonUser.email, name: "سعد", relation: "son" }, "ar", req);
    await acceptInvite(sonUser.id, tokenFor(sonUser.email), {});
    await leaveFamily(sonUser.id);
    expect(await familyOf(sonUser.id)).toBeNull();
    const f2 = await transferHead(head.id, (await familyOf(head.id))!.members.find((m) => m.userId === wife.id)!.key);
    expect(f2.ownerId).toBe(wife.id);
    await expect(removeMember(head.id, "x")).rejects.toThrow("notHead");
    await removeMember(wife.id, f2.members.find((m) => m.userId === head.id)!.key);
    expect(await familyOf(head.id)).toBeNull();
    await deleteFamily(wife.id);
    expect(await familyOf(wife.id)).toBeNull();
    expect(fam.id).toBeTruthy();
  });

  it("hands the family over when the head deletes the account", async () => {
    const head = await user("Majed");
    const bro = await user("Turki");
    await createFamily(head.id, "Group");
    await inviteMember(head.id, { email: bro.email, name: "Turki", relation: "brother" }, "en", req);
    await acceptInvite(bro.id, tokenFor(bro.email), {});
    await onAccountDeleted(head.id);
    const f = (await familyOf(bro.id))!;
    expect(f.ownerId).toBe(bro.id);
    expect(f.members).toHaveLength(1);
  });

  it("limits invitations and validates them", async () => {
    const head = await user("Ali");
    await createFamily(head.id, "Big");
    await expect(inviteMember(head.id, { email: "bad", name: "x", relation: "son" }, "ar", req)).rejects.toThrow("email");
    await expect(inviteMember(head.id, { email: "a@b.co", name: "x", relation: "boss" }, "ar", req)).rejects.toThrow("required");
    for (let i = 0; i < 11; i++) await inviteMember(head.id, { email: `m${i}@example.com`, name: `M${i}`, relation: "friend" }, "ar", req);
    await expect(inviteMember(head.id, { email: "m99@example.com", name: "x", relation: "friend" }, "ar", req)).rejects.toThrow("familyFull");
    // Re-inviting the same email resends instead of adding.
    await inviteMember(head.id, { email: "m0@example.com", name: "M0", relation: "friend" }, "ar", req);
    expect((await store().findBy<{ ownerId: string; members: unknown[] }>("families", "ownerId", head.id))[0].members).toHaveLength(12);
  });
});

describe("trip share links", () => {
  it("shows the itinerary without names, passports, prices or reference, until revoked", async () => {
    const u = await user("Reem");
    const other = await user("Else");
    const b = booking(u.id, "2099-05-01", "2099-05-06");
    await store().put("bookings", b.id, b);
    await expect(createTripShare(other.id, b.id, "ar", req)).rejects.toThrow("notFound");
    const link = await createTripShare(u.id, b.id, "en", req);
    expect(link.url).toMatch(/^http:\/\/localhost\/en\/trip\/[\w-]{30,}$/);
    const raw = link.url.split("/trip/")[1];
    const trip = (await sharedTrip(raw))!;
    expect(trip).toMatchObject({ cities: ["RUH"], departureDate: "2099-05-01", travellers: 1 });
    expect(trip.hotels[0]).toMatchObject({ nameEn: "Hotel", lat: 24.7 });
    const text = JSON.stringify(trip);
    for (const secret of ["SARA", "A123", "5000", b.reference]) expect(text).not.toContain(secret);
    expect(await listTripShares(u.id, b.id)).toHaveLength(1);
    expect(await revokeTripShare(u.id, link.ref)).toBe(true);
    expect(await sharedTrip(raw)).toBeNull();
    const past = booking(u.id, "2020-01-01", "2020-01-05");
    await store().put("bookings", past.id, past);
    await expect(createTripShare(u.id, past.id, "ar", req)).rejects.toThrow("tripEnded");
    expect(await sharedTrip("nope")).toBeNull();
  });
});
