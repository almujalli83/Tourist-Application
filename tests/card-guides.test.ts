import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicUser } from "@/lib/auth/types";
import type { StoredBooking } from "@/lib/bookings/types";
import { cardReadyNotifications, cardToken, listCards, verifyCardToken } from "@/lib/card/card";
import { cancelGuideRequest, expireGuideRequests, getGuideBooking, listGuideBookings, requestByToken, requestGuide, respondToRequest, GuideBookingError } from "@/lib/guides/bookings";
import { getGuide, importGuides, parseGuidesCsv, searchGuides, suggestGuides, syncGuidesFromMt, verifyLicense } from "@/lib/guides/guides";
import { listOutbox } from "@/lib/notify";
import { saveBooking } from "@/lib/repo";
import { pendingReviews } from "@/lib/reviews/reviews";
import { store } from "@/lib/store";

const now = new Date("2026-09-27T09:00:00Z");
const user = (id: string): PublicUser => ({
  id, email: `${id}@example.com`, accountType: "individual", preferredLocale: "en", preferredCurrency: "SAR", createdAt: "2026-09-01T00:00:00Z",
  individual: { fullName: "Pierre Durand", phone: "+33600000000", nationality: "FR" },
});
const applicant = (n: string, passportNo: string, extra: Record<string, unknown> = {}) => ({
  applicationNo: n, paxType: "adult", nameEn: `TRAVELLER ${n}`, nationality: "FR", passportNo, email: `${n}@example.com`,
  sponsorApplicationNo: null, submission: null, appStatus: "COMPLETED", visaNumber: `60${n}`, visaIssueDate: "2026-09-20",
  visaExpiryDate: "2027-09-20", visaStatus: "ISSUED", insuranceStatus: "ISSUED", ...extra,
});
function booking(id: string, userId: string, departureDate: string, returnDate: string, applicants: unknown[]): StoredBooking {
  return {
    id, reference: `TA-${id}`, userId, accountType: "individual", clientReference: null, createdAt: "2026-09-20T10:00:00Z",
    criteria: { origin: "CDG", stays: [{ city: "RUH", nights: 3 }, { city: "ULH", nights: 2 }], departureDate, returnDate, rooms: [{ adults: 2, childAges: [] }], pax: { adults: 2, children: 0, infants: 0 }, cabin: "economy", nationality: "FR" },
    flights: [], hotels: [{ city: "RUH", checkIn: departureDate, checkOut: "2026-10-01", nameAr: "فندق", nameEn: "Test Hotel" }], activities: [], price: { totalSAR: 1 }, displayCurrency: "SAR",
    payment: null, status: "COMPLETED", mt: { mode: "sandbox", messageId: "m", packageId: "p", packageStatus: "COMPLETED", lastCheckedAt: null },
    applicants, ticketNos: [], modifications: [],
  } as unknown as StoredBooking;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.DEMO_CARD;
  delete process.env.MT_GUIDES_URL;
  delete process.env.MT_GUIDES_TOKEN;
});

describe("digital tourist card", () => {
  it("shows a sample card only without issued visas (sandbox)", async () => {
    expect((await listCards("card-none", now))[0]).toMatchObject({ demo: true, valid: true });
    process.env.DEMO_CARD = "off";
    expect(await listCards("card-none", now)).toEqual([]);
  });

  it("lists one card per traveller (family), the latest trip first, with only the passport's last 4 digits", async () => {
    await saveBooking(booking("c-old", "card-u1", "2026-05-01", "2026-05-06", [applicant("1", "AB1234567", { visaExpiryDate: "2026-09-01" })]));
    await saveBooking(booking("c-new", "card-u1", "2026-09-28", "2026-10-03", [applicant("2", "AB1234567"), applicant("3", "CD7654321"), applicant("4", "EF0000001", { visaNumber: null })]));
    const cards = await listCards("card-u1", now);
    expect(cards.map((c) => c.id)).toEqual(["c-new:2", "c-new:3"]);
    expect(cards[0]).toMatchObject({ passportLast4: "4567", valid: true, insurance: "ISSUED", trip: { reference: "TA-c-new", city: "RUH", hotelEn: "Test Hotel", returnDate: "2026-10-03" } });
    expect(JSON.stringify(cards)).not.toContain("AB1234567");
  });

  it("marks a card invalid when the visa has expired", async () => {
    await saveBooking(booking("c-exp", "card-u2", "2025-05-01", "2025-05-06", [applicant("5", "GH1112223", { visaExpiryDate: "2026-09-01" })]));
    const [c] = await listCards("card-u2", now);
    expect(c.valid).toBe(false);
    expect((await verifyCardToken(cardToken(c, now).token, now)).result).toBe("invalidVisa");
  });

  it("verifies a signed rotating code, and rejects expired or forged ones", async () => {
    const [c] = await listCards("card-u1", now);
    const { token, expiresAt } = cardToken(c, now);
    expect(Date.parse(expiresAt) - now.getTime()).toBe(60_000);
    const ok = await verifyCardToken(token, new Date(now.getTime() + 30_000));
    expect(ok).toMatchObject({ result: "valid", card: { nameEn: "TRAVELLER 2", nationality: "FR", visaExpiryDate: "2027-09-20" } });
    expect(JSON.stringify("card" in ok ? ok.card : {})).not.toContain("visaNumber");
    expect(ok.personKey).toBe("FR:AB1234567"); // server side only, for the wallet photo
    expect((await verifyCardToken(token, new Date(now.getTime() + 61_000))).result).toBe("expiredCode");
    const parts = token.split(".");
    const forged = [Buffer.from("someone-else").toString("base64url"), parts[1], parts[2], parts[3]].join(".");
    expect((await verifyCardToken(forged, now)).result).toBe("invalid");
    expect((await verifyCardToken("garbage", now)).result).toBe("invalid");
    // The offline code lasts 12 hours.
    const offline = cardToken(c, now, 12 * 3600);
    expect((await verifyCardToken(offline.token, new Date(now.getTime() + 11 * 3600_000))).result).toBe("valid");
  });

  it("tells the traveller once that the card is ready (in the app and by email)", async () => {
    await store().put("users", "card-u1", { ...user("card-u1"), passwordHash: "x" });
    await cardReadyNotifications("card-u1", now);
    await cardReadyNotifications("card-u1", now);
    const notes = (await store().findBy<{ kind: string; id: string }>("notifications", "userId", "card-u1")).filter((n) => n.kind === "card");
    expect(notes.map((n) => n.id).sort()).toEqual(["card:c-new:2", "card:c-new:3"]);
    expect((await listOutbox(50)).filter((m) => m.to.includes("card-u1@example.com") && m.subject.includes("Digital tourist card"))).toHaveLength(2);
  });
});

describe("licensed tour guides", () => {
  it("shows only valid licences, the expired sample guide is hidden and verifies as expired", async () => {
    const all = await searchGuides({}, now);
    expect(all.length).toBeGreaterThanOrEqual(6);
    expect(all.every((g) => g.licenseExpiry >= "2026-09-27")).toBe(true);
    expect(all.some((g) => g.licenseNo === "TG-DEMO-1099")).toBe(false);
    expect(await getGuide("TG-DEMO-1099", now)).toBeNull();
    expect(await verifyLicense("TG-DEMO-1099", now)).toEqual({ result: "expired" });
    expect(await verifyLicense("NOPE-1", now)).toEqual({ result: "notFound" });
    expect((await verifyLicense("TG-DEMO-1001", now)).result).toBe("valid");
  });

  it("filters by city, language (native and fluent first), track and gender", async () => {
    const en = await searchGuides({ city: "RUH", language: "en" }, now);
    expect(en.map((g) => g.licenseNo)).toEqual(["TG-DEMO-1002", "TG-DEMO-1001"]); // native before fluent
    expect((await searchGuides({ language: "zh" }, now)).map((g) => g.licenseNo)).toEqual(["TG-DEMO-1003"]);
    expect((await searchGuides({ track: "religious" }, now)).map((g) => g.licenseNo)).toEqual(["TG-DEMO-1005"]);
    expect((await searchGuides({ city: "RUH", gender: "female" }, now)).map((g) => g.licenseNo)).toEqual(["TG-DEMO-1002"]);
    expect((await searchGuides({ q: "alanazi" }, now)).map((g) => g.licenseNo)).toEqual(["TG-DEMO-1003"]);
  });

  it("imports a CSV, skipping expired licences and hiding a guide whose licence is reported expired", async () => {
    const csv = [
      "licenseNo,licenseExpiry,nameAr,nameEn,gender,mobile,email,languages,cities,tracks,bioAr,bioEn",
      'IMP-001,2027-12-31,مرشد أول,First Guide,male,0500000001,g1@example.com,"ar:native|en:fluent|ja:good",RUH|JED,heritage|city,نبذة,"Bio, with comma"',
      "IMP-002,2026-01-01,مرشد منتهٍ,Expired Guide,female,0500000002,,en:fluent,RUH,heritage,,",
      "bad,,,,,,,,,,,",
    ].join("\n");
    const rows = parseGuidesCsv(csv);
    expect(rows[0].bioEn).toBe("Bio, with comma");
    expect(await importGuides(rows, "import", {}, now)).toEqual({ imported: 1, skippedExpired: 1, invalid: 1, removed: 0 });
    const g = await getGuide("IMP-001", now);
    expect(g).toMatchObject({ languages: [{ code: "ar", level: "native" }, { code: "en", level: "fluent" }, { code: "ja", level: "good" }], cities: ["RUH", "JED"], tracks: ["heritage", "city"] });
    expect(await getGuide("IMP-002", now)).toBeNull();
    // Renewal shows the guide again; a later report of expiry hides them.
    await importGuides([{ licenseNo: "IMP-001", licenseExpiry: "2026-09-01", nameEn: "First Guide" }], "import", {}, now);
    expect(await getGuide("IMP-001", now)).toBeNull();
    await importGuides(rows.slice(0, 1), "import", {}, now);
    expect(await getGuide("IMP-001", now)).not.toBeNull();
    // Hidden automatically on the day after expiry, even without a new sync.
    expect(await getGuide("IMP-001", new Date("2028-01-01T00:00:00Z"))).toBeNull();
  });

  it("syncs from the Ministry of Tourism API with the token, withdrawing guides no longer listed", async () => {
    process.env.MT_GUIDES_URL = "https://mt.example/guides";
    process.env.MT_GUIDES_TOKEN = "tok";
    let list = [{ licenseNo: "MT-1", licenseExpiry: "2027-06-30", nameAr: "أ", nameEn: "A", gender: "male", mobile: "0500000011", languages: [{ code: "en", level: "native" }], cities: ["JED"], tracks: ["diving"] },
      { licenseNo: "MT-2", licenseExpiry: "2027-06-30", nameAr: "ب", nameEn: "B", gender: "female", mobile: "0500000012", languages: [{ code: "fr", level: "fluent" }], cities: ["JED"], tracks: ["food"] }];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: list }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await syncGuidesFromMt(now)).toEqual({ imported: 2, skippedExpired: 0, invalid: 0, removed: 0 });
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ authorization: "Bearer tok" });
    list = list.slice(0, 1);
    expect(await syncGuidesFromMt(now)).toMatchObject({ imported: 1, removed: 1 });
    expect(await getGuide("MT-2", now)).toBeNull();
    expect(await verifyLicense("MT-2", now)).toEqual({ result: "expired" });
    delete process.env.MT_GUIDES_URL;
    expect(await syncGuidesFromMt(now)).toBeNull();
  });

  it("suggests guides per trip city in the traveller's language and interests", async () => {
    const s = await suggestGuides(["RUH", "ULH"], "zh", ["nature"], now);
    expect(s.ULH.map((g) => g.licenseNo)).toEqual(["TG-DEMO-1003"]);
    expect(s.RUH.length).toBeGreaterThan(0); // nobody speaks Chinese in Riyadh: any licensed guide there
  });

  it("sends a request the guide confirms from the email link; the traveller is told", async () => {
    const u = user("guide-u1");
    await store().put("users", u.id, { ...u, passwordHash: "x" });
    const input = { licenseNo: "TG-DEMO-1001", city: "RUH", date: "2026-10-05", startTime: "09:30", hours: 3, people: 2, language: "fr", notes: "Diriyah" };
    await expect(requestGuide(u, { ...input, language: "de" }, "https://x", now)).rejects.toMatchObject({ code: "invalidLanguage" });
    await expect(requestGuide(u, { ...input, city: "JED" }, "https://x", now)).rejects.toMatchObject({ code: "invalidCity" });
    await expect(requestGuide(u, { ...input, date: "2026-09-01" }, "https://x", now)).rejects.toMatchObject({ code: "invalidDate" });
    await expect(requestGuide(u, { ...input, licenseNo: "TG-DEMO-1099" }, "https://x", now)).rejects.toBeInstanceOf(GuideBookingError);
    const b = await requestGuide(u, input, "https://x", now);
    expect(b).toMatchObject({ status: "pending", guide: { licenseNo: "TG-DEMO-1001" }, userPhone: "+33600000000" });
    expect(b.respondUrl).toMatch(/^https:\/\/x\/ar\/guides\/respond\//);
    expect(JSON.stringify(b)).not.toContain('"token"');
    await expect(requestGuide(u, input, "https://x", now)).rejects.toMatchObject({ code: "duplicate" });
    const mail = (await listOutbox(50)).find((m) => m.to.includes("guide1001@example.com"));
    expect(mail?.text).toContain(b.respondUrl!);
    const token = b.respondUrl!.split("/").pop()!;
    expect((await requestByToken(token))?.id).toBe(b.id);
    const done = await respondToRequest(token, "confirm", "See you at the gate", now, { text: "At-Turaif main gate", link: "https://maps.google.com/?q=24.7336,46.5753" });
    expect(done).toMatchObject({ status: "confirmed", guideNote: "See you at the gate", meetingPoint: { text: "At-Turaif main gate", lat: 24.7336, lng: 46.5753 } });
    await expect(respondToRequest(token, "decline", null, now)).rejects.toMatchObject({ code: "alreadyAnswered" });
    const note = await store().get<{ kind: string; titleEn: string }>("notifications", `guide:${b.id}:confirmed`);
    expect(note).toMatchObject({ kind: "guide" });
    expect((await listGuideBookings(u.id, now)).map((x) => x.id)).toEqual([b.id]);
    // After the tour: the guide can be rated (verified review).
    const later = new Date("2026-10-06T09:00:00Z");
    expect((await pendingReviews(u, later)).some((i) => i.targetType === "guide" && i.targetId === "TG-DEMO-1001" && !i.demo)).toBe(true);
    expect((await pendingReviews(u, now)).some((i) => i.targetType === "guide" && !i.demo)).toBe(false);
  });

  it("lets the traveller cancel, and cancels requests automatically when the licence expires", async () => {
    const u = user("guide-u2");
    await store().put("users", u.id, { ...u, passwordHash: "x" });
    await importGuides([{ licenseNo: "EXP-9", licenseExpiry: "2026-10-01", nameAr: "م", nameEn: "Soon Expired", gender: "male", mobile: "0500000099", email: "exp9@example.com", languages: "en:fluent", cities: "RUH", tracks: "city" }], "import", {}, now);
    const b1 = await requestGuide(u, { licenseNo: "EXP-9", city: "RUH", date: "2026-09-30", startTime: "10:00", hours: 2, people: 1, language: "en" }, "https://x", now);
    const b2 = await requestGuide(u, { licenseNo: "TG-DEMO-1002", city: "RUH", date: "2026-10-02", startTime: "10:00", hours: 2, people: 1, language: "en" }, "https://x", now);
    expect((await cancelGuideRequest(u.id, b2.id, now)).status).toBe("cancelled");
    await expect(cancelGuideRequest("someone", b1.id, now)).rejects.toMatchObject({ code: "notFound" });
    // The licence expires: pending request cancelled, traveller notified.
    const after = new Date("2026-10-02T06:00:00Z");
    expect(await expireGuideRequests(after)).toBe(1);
    const got = await getGuideBooking(u.id, b1.id, after);
    expect(got).toMatchObject({ status: "cancelled", cancelReason: "licenseExpired" });
    expect(await store().get("notifications", `guide:${b1.id}:licenseExpired`)).toMatchObject({ kind: "guide", severity: "warning" });
    expect(await expireGuideRequests(after)).toBe(0);
  });
});
