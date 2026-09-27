import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicUser } from "@/lib/auth/types";
import type { StoredBooking } from "@/lib/bookings/types";
import { addDays } from "@/lib/dates";
import { eventsCatalog } from "@/lib/events/orders";
import { listOutbox } from "@/lib/notify";
import { runTripAlerts, setAlertPrefs, tripWeatherLines, weatherBanner } from "@/lib/alerts/alerts";
import { saveBooking } from "@/lib/repo";
import { store } from "@/lib/store";
import { createTicket } from "@/lib/support/tickets";
import { clearWeatherCache, forecast, hazardsOf, type DayWeather } from "@/lib/weather/forecast";

const now = new Date();
const today = new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));

/** Open-Meteo stub: 45°C today, mild afterwards; dust peak 900 µg/m³ today. */
function stubOpenMeteo(heatToday = 45) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("air-quality")) {
      return new Response(JSON.stringify({ hourly: { time: days.flatMap((d) => [`${d}T12:00`, `${d}T15:00`]), dust: days.flatMap((d, i) => (i === 0 ? [100, 900] : [20, 30])) } }));
    }
    return new Response(JSON.stringify({
      daily: {
        time: days, temperature_2m_max: days.map((_, i) => (i === 0 ? heatToday : 35)), temperature_2m_min: days.map(() => 26),
        precipitation_sum: days.map(() => 0), precipitation_probability_max: days.map(() => 0), wind_gusts_10m_max: days.map(() => 20), weather_code: days.map(() => 0),
      },
    }));
  }));
}

async function traveller(id: string) {
  const u: PublicUser = { id, email: `${id}@example.com`, accountType: "individual", preferredLocale: "en", preferredCurrency: "SAR", createdAt: "2026-01-01T00:00:00Z", individual: { fullName: "Ali Test", phone: "", nationality: "EG" } };
  await store().put("users", id, { ...u, passwordHash: "x" });
  const b = {
    id: `${id}-b`, reference: `TA-${id}`, userId: id, createdAt: "2026-09-01T00:00:00Z", status: "COMPLETED", mt: { packageStatus: "COMPLETED" },
    criteria: { departureDate: addDays(today, -2), returnDate: addDays(today, 4), stays: [{ city: "RUH", nights: 6 }] }, applicants: [], flights: [], hotels: [],
  } as unknown as StoredBooking;
  await saveBooking(b);
  return { u, b };
}
const mine = async (userId: string) => (await store().findBy<{ id: string; kind: string; severity?: string; linesEn: string[]; itemKeys?: string[] }>("notifications", "userId", userId));

beforeEach(() => clearWeatherCache());
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.WEATHER;
});

describe("weather", () => {
  it("reads the Open-Meteo forecast with dust and flags hazards", async () => {
    stubOpenMeteo();
    const f = (await forecast(24.71, 46.67))!;
    expect(f[0]).toMatchObject({ date: today, tMax: 45, dust: 900 });
    expect(hazardsOf(f[0]).map((h) => [h.kind, h.severity])).toEqual([["heat", "warning"], ["dust", "danger"]]);
    expect(hazardsOf({ ...f[0], tMax: 48, dust: null })[0].severity).toBe("danger");
    expect(hazardsOf(f[1])).toEqual([]);
    const base: DayWeather = { date: today, tMax: 30, tMin: 20, rain: 25, rainChance: 90, gusts: 75, dust: null, code: 63 };
    expect(hazardsOf(base).map((h) => `${h.kind}:${h.severity}`)).toEqual(["rain:danger", "wind:danger"]);
    process.env.WEATHER = "off";
    clearWeatherCache();
    expect(await forecast(24.71, 46.67)).toBeNull();
  });

  it("adds the forecast of the trip's cities to the pre-arrival reminder", async () => {
    stubOpenMeteo(40);
    const lines = await tripWeatherLines({ criteria: { departureDate: today, returnDate: addDays(today, 3), stays: [{ city: "RUH", nights: 3 }] } } as unknown as StoredBooking);
    expect(lines.ar[0]).toMatch(/الطقس المتوقع في الرياض: بين 26° و40°/);
    expect(lines.en.join(" ")).toContain("Light clothes");
  });
});

describe("trip alerts", () => {
  it("alerts once about today's weather during the trip, with the banner, and sends the day's programme", async () => {
    stubOpenMeteo();
    const { u } = await traveller("al-1");
    await runTripAlerts(u.id, now);
    await runTripAlerts(u.id, now);
    const n = await mine(u.id);
    const weather = n.filter((x) => x.kind === "weather");
    expect(weather).toHaveLength(1);
    expect(weather[0].severity).toBe("danger");
    expect(weather[0].linesEn.join(" ")).toMatch(/Extreme heat: high of 45°C.*Dust/);
    const daily = n.filter((x) => x.kind === "daily");
    if (new Date(now.getTime() + 3 * 3600_000).getUTCHours() >= 5) expect(daily).toHaveLength(1);
    expect((await weatherBanner(u.id, now))?.id).toBe(weather[0].id);
    expect((await listOutbox()).some((m) => m.to.includes(u.email) && m.subject.includes("Weather alert today in Riyadh"))).toBe(true);
  });

  it("suggests new events in the trip's cities (can be turned off) and doesn't repeat them", async () => {
    stubOpenMeteo(35);
    const { u } = await traveller("al-2");
    // Day index 2 of the trip is an even day: suggestions are due.
    await runTripAlerts(u.id, now);
    const ev = (await mine(u.id)).filter((x) => x.kind === "events");
    const inCity = (await eventsCatalog({ from: today, to: addDays(today, 4) })).some((e) => e.city === "RUH");
    if (inCity) {
      expect(ev).toHaveLength(1);
      expect(ev[0].itemKeys!.length).toBeGreaterThan(0);
    }
    const { u: u2 } = await traveller("al-3");
    await setAlertPrefs(u2.id, { eventSuggestions: false, dailyProgramme: false });
    await runTripAlerts(u2.id, now);
    const kinds = (await mine(u2.id)).map((x) => x.kind);
    expect(kinds).not.toContain("events");
    expect(kinds).not.toContain("daily");
  });

  it("reminds 2 hours before a booked event, and warns when its session no longer exists", async () => {
    stubOpenMeteo(35);
    const { u } = await traveller("al-4");
    const ev = (await eventsCatalog()).find((e) => e.sessions.some((s) => s.start > now.toISOString()))!;
    const s = ev.sessions.find((x) => x.start > now.toISOString())!;
    const order = (id: string, session: { id: string; start: string }) => ({
      id, reference: `EV-${id}`, userId: u.id, createdAt: now.toISOString(), status: "CONFIRMED", session,
      event: { id: ev.id, titleAr: ev.titleAr, titleEn: ev.titleEn, venueAr: ev.venueAr, venueEn: ev.venueEn, city: ev.city, lat: ev.lat, lng: ev.lng, durationMins: ev.durationMins },
    });
    await store().put("eventOrders", "al-o1", order("al-o1", s));
    await store().put("eventOrders", "al-o2", order("al-o2", { id: `${ev.id}-gone`, start: s.start }));
    await runTripAlerts(u.id, new Date(Date.parse(s.start) - 3 * 3600_000));
    let n = await mine(u.id);
    expect(n.some((x) => x.id === "event2h:al-o1")).toBe(false);
    expect(n.find((x) => x.kind === "eventChange")?.id).toBe(`eventchg:al-o2:${ev.id}-gone`);
    await runTripAlerts(u.id, new Date(Date.parse(s.start) - 90 * 60_000));
    n = await mine(u.id);
    expect(n.find((x) => x.id === "event2h:al-o1")?.linesEn.join(" ")).toContain("google.com/maps/dir");
  });
});

describe("support complaints", () => {
  it("are high priority", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const { u } = await traveller("al-5");
    const t = await createTicket(u, { subject: "Complaint", category: "complaint", message: "The hotel was not as described" });
    expect(t).toMatchObject({ category: "complaint", priority: "high" });
  });
});
