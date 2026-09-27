import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicUser } from "@/lib/auth/types";
import type { StoredBooking } from "@/lib/bookings/types";
import { listOutbox } from "@/lib/notify";
import { listNotifications } from "@/lib/reminders/reminders";
import { saveBooking } from "@/lib/repo";
import { pendingReviews } from "@/lib/reviews/reviews";
import { seedSupportQueue, seedTravellerSample } from "@/lib/support/demo";
import {
  adminGetTicket, adminListTickets, adminUpdateTicket, createTicket, getMyTicket, listMyTickets, staffReply, ticketAttachment, travellerClose, travellerReply,
} from "@/lib/support/tickets";
import { translateSupport } from "@/lib/support/translate";
import { store } from "@/lib/store";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const user = (id: string, locale: "ar" | "en" = "en"): PublicUser => ({
  id, email: `${id}@example.com`, accountType: "individual", preferredLocale: locale, preferredCurrency: "SAR", createdAt: "2026-09-01T00:00:00Z",
  individual: { fullName: "Pierre Durand", phone: "", nationality: "FR" },
});
const admin = { ...user("sup-admin"), email: "admin-support@example.com", isAdmin: true, individual: { fullName: "Nora Staff", phone: "", nationality: "SA" } } as PublicUser;

/** MyMemory stub: "fr|ar" → "[ar] text"; "ar|fr" → "[fr] text". */
function stubMyMemory() {
  const fn = vi.fn(async (url: string) => {
    const u = new URL(url);
    const [, to] = u.searchParams.get("langpair")!.split("|");
    return new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: `[${to}] ${u.searchParams.get("q")}` } }), { status: 200 });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SUPPORT_TRANSLATE;
  delete process.env.DEMO_SUPPORT;
});

describe("multilingual support", () => {
  it("opens a ticket in the traveller's language, translated for the team, and routes replies back", async () => {
    const fetchMock = stubMyMemory();
    const u = user("sup-u1");
    await store().put("users", u.id, { ...u, passwordHash: "x" });
    const t = await createTicket(u, { subject: "Réservation", category: "restaurants", message: "Bonjour, je voudrais changer l'heure.", lang: "fr", attachments: [{ name: "reçu.png", data: PNG }] }, new Date("2026-09-26T10:00:00Z"));
    expect(t.number).toMatch(/^SUP-\d+$/);
    expect(t).toMatchObject({ status: "open", priority: "normal", lang: "fr", category: "restaurants" });
    expect(t.messages[0]).toMatchObject({ from: "traveller", lang: "fr", translation: { lang: "ar", text: "[ar] Bonjour, je voudrais changer l'heure." } });
    expect(t.messages[0].attachments[0]).toMatchObject({ name: "re_u.png", contentType: "image/png" });
    expect(fetchMock.mock.calls[0][0]).toContain("langpair=fr|ar");

    // The team replies in Arabic; the traveller gets it in French, in the app and by email.
    const r = await staffReply(admin, t.id, { message: "أهلًا، تم تغيير الموعد." }, new Date("2026-09-26T10:30:00Z"));
    expect(r.status).toBe("waiting");
    expect(r.assignedTo).toBe("admin-support@example.com");
    expect(r.messages[1]).toMatchObject({ from: "staff", author: "Nora Staff", lang: "ar", translation: { lang: "fr", text: "[fr] أهلًا، تم تغيير الموعد." } });
    const n = (await listNotifications(u.id, new Date("2026-09-26T10:31:00Z"))).find((x) => x.kind === "support")!;
    expect(n).toMatchObject({ href: `/support/${t.id}`, titleEn: `New reply on support ticket ${t.number}` });
    expect((await listOutbox()).some((m) => m.to.includes(u.email) && m.text.includes("[fr] أهلًا"))).toBe(true);

    // Traveller replies (re-opens), then closes.
    expect((await travellerReply(u, t.id, { message: "Merci !" })).status).toBe("open");
    expect((await travellerClose(u.id, t.id)).status).toBe("closed");
    expect((await travellerReply(u, t.id, { message: "Encore une question" })).status).toBe("open");

    // Only the owner (and the team) can read it and its files.
    await expect(getMyTicket("someone-else", t.id)).rejects.toMatchObject({ code: "notFound" });
    const fileId = t.messages[0].attachments[0].id;
    expect(await ticketAttachment(t.id, fileId, user("intruder"))).toBeNull();
    expect((await ticketAttachment(t.id, fileId, u))?.contentType).toBe("image/png");
    expect((await ticketAttachment(t.id, fileId, admin))?.name).toBe("re_u.png");
  });

  it("is high priority for a trip under way or within 48 hours, and sorted first for the team", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const u = user("sup-u2", "ar");
    await saveBooking({
      id: "sup-b2", reference: "TA-SUP2", userId: u.id, createdAt: "2026-09-20T00:00:00Z", status: "COMPLETED", mt: { packageStatus: "COMPLETED" },
      criteria: { departureDate: "2026-09-27", returnDate: "2026-10-02", stays: [{ city: "RUH", nights: 5 }] }, applicants: [], price: { totalSAR: 5000 },
    } as unknown as StoredBooking);
    const t = await createTicket(u, { subject: "تأشيرتي", category: "visa", message: "لم تصل التأشيرة", bookingId: "sup-b2" }, new Date("2026-09-26T09:00:00Z"));
    expect(t).toMatchObject({ priority: "high", lang: "ar", booking: { reference: "TA-SUP2" } });
    expect(t.messages[0].translation).toBeNull(); // Arabic: nothing to translate
    const queue = await adminListTickets({ status: "open" });
    expect(queue[0].id).toBe(t.id);
    const detail = await adminGetTicket(t.id);
    expect(detail.booking).toMatchObject({ reference: "TA-SUP2", departureDate: "2026-09-27", cities: ["RUH"] });
    await expect(createTicket(u, { subject: "x", message: "y", bookingId: "not-mine" })).rejects.toMatchObject({ code: "booking" });
    await expect(createTicket(u, { subject: "", message: "y" })).rejects.toMatchObject({ code: "subject" });
    await expect(createTicket(u, { subject: "x", message: "y", attachments: [{ name: "a.exe", data: "data:application/x-msdownload;base64,AAAA" }] })).rejects.toMatchObject({ code: "attachments" });
    const updated = await adminUpdateTicket(t.id, { status: "closed", assignedTo: "not-an-admin@example.com" });
    expect(updated).toMatchObject({ status: "closed", assignedTo: null });
  });

  it("keeps the original when translation is unavailable, and splits long texts for MyMemory", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await translateSupport("Hello", "en", "ar")).toBeNull();
    const fetchMock = stubMyMemory();
    const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const out = await translateSupport(long, "en", "ar");
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(out).toContain("[ar]");
    process.env.SUPPORT_TRANSLATE = "off";
    expect(await translateSupport("Hello", "en", "ar")).toBeNull();
  });

  it("asks for a support rating once a ticket is closed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const u = user("sup-u3");
    const t = await createTicket(u, { subject: "Help", message: "Question" });
    expect((await pendingReviews(u)).some((i) => i.key === `service:support:${u.id}`)).toBe(false);
    await travellerClose(u.id, t.id);
    expect((await pendingReviews(u, new Date(Date.now() + 10 * 60_000))).some((i) => i.key === `service:support:${u.id}`)).toBe(true);
  });

  it("shows sample tickets in sandbox mode", async () => {
    await seedSupportQueue(new Date("2026-09-26T10:00:00Z"));
    await seedSupportQueue(new Date("2026-09-26T10:00:00Z"));
    const demo = (await adminListTickets({ status: "all" })).filter((t) => t.id.startsWith("demo-queue-"));
    expect(demo.map((t) => t.lang).sort()).toEqual(["en", "fr", "ur"]);
    const u = user("sup-u4");
    await seedTravellerSample(u);
    await seedTravellerSample(u);
    const mine = await listMyTickets(u.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ demo: true, status: "waiting" });
    expect(mine[0].messages[1].translation?.text).toContain("Gates usually open");
    process.env.DEMO_SUPPORT = "off";
    await seedTravellerSample(user("sup-u5"));
    expect(await listMyTickets("sup-u5")).toEqual([]);
  });
});
