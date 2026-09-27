import { afterEach, describe, expect, it, vi } from "vitest";

const ai = vi.hoisted(() => ({ on: false, calls: 0 }));
vi.mock("@/lib/assistant/claude", () => ({ aiConfigured: () => ai.on }));
vi.mock("@/lib/assistant/translate", () => ({
  translateText: vi.fn(async (text: string, _from: string, to: string) => {
    ai.calls++;
    await new Promise((r) => setTimeout(r, 5));
    return `[${to}] ${text}`;
  }),
}));

import { speechChunks } from "@/components/audio/format";
import { seedTours } from "@/lib/audio/seed";
import { addRecording, AudioError, createTour, deleteTour, getTour, listTours, removeRecording, stopAudio, tourView, updateTour } from "@/lib/audio/tours";
import { sniffAudio } from "@/lib/audio/tts";
import { seedPlaces } from "@/lib/guide/seed";
import { GET as clipRoute } from "@/app/api/audio/clip/[tour]/[stop]/[lang]/route";

const MP3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(200, 7)]);

afterEach(() => {
  ai.on = false;
  ai.calls = 0;
  delete process.env.TTS_PROVIDER;
  vi.unstubAllGlobals();
});

describe("audio guides: starter content", () => {
  it("has Arabic and English narration for every stop, in the Kingdom, with valid guide places", () => {
    const tours = seedTours();
    const places = new Set(seedPlaces().map((p) => p.id));
    expect(tours.map((t) => t.id)).toEqual(["ruh-diriyah", "ruh-old-riyadh", "jed-albalad", "ulh-alula", "mkx-history", "med-history"]);
    for (const t of tours) {
      expect(new Set(t.stops.map((s) => s.id)).size).toBe(t.stops.length);
      for (const s of t.stops) {
        expect(s.scripts.ar!.length).toBeGreaterThan(80);
        expect(s.scripts.en!.length).toBeGreaterThan(80);
        expect(s.lat > 15 && s.lat < 33 && s.lng > 34 && s.lng < 56).toBe(true);
        if (s.placeId) expect(places.has(s.placeId)).toBe(true);
      }
    }
  });

  it("lists published tours by city and by guide place", async () => {
    const all = await listTours();
    expect(all).toHaveLength(6);
    expect((await listTours({ city: "JED" })).map((t) => t.id)).toEqual(["jed-albalad"]);
    const masmak = seedPlaces().find((p) => p.nameEn === "Masmak Fortress")!;
    const r = await listTours({ placeId: masmak.id });
    expect(r.map((t) => t.id)).toEqual(["ruh-old-riyadh"]);
    expect(r[0].placeStops[masmak.id]).toBe("masmak");
    expect(r[0].langs).toEqual(["ar", "en"]);
    expect(r[0].km).toBeGreaterThan(1);
  });
});

describe("audio guides: languages", () => {
  it("reads by the device's voice when there is no recording or voice provider", async () => {
    const v = (await tourView("jed-albalad", "en"))!;
    expect(v.stopsList[0]).toMatchObject({ source: "device", audio: null, machine: false });
    expect(v.stopsList[0].text).toContain("Bab Makkah");
  });

  it("leaves a language unavailable without machine translation", async () => {
    const v = (await tourView("ruh-diriyah", "tr"))!;
    expect(v.stopsList.every((s) => s.text === null)).toBe(true);
  });

  it("translates a missing language once, marks it for review and keeps it", async () => {
    ai.on = true;
    const [a, b] = await Promise.all([tourView("med-history", "ur"), tourView("med-history", "ur")]);
    expect(ai.calls).toBe(6); // one per stop, even for simultaneous visitors
    expect(a!.stopsList[0].text).toMatch(/^\[ur\] /);
    expect(b!.stopsList[0].machine).toBe(true);
    const again = (await tourView("med-history", "ur"))!;
    expect(ai.calls).toBe(6);
    expect(again.langs).toContain("ur");
    // Urdu is translated from Arabic, the Latin-script languages from English.
    expect(again.stopsList[0].text).toContain("المسجد");
    await tourView("med-history", "fr");
    expect((await getTour("med-history"))!.stops[0].scripts.fr).toContain("Prophet");
  });
});

describe("audio guides: audio", () => {
  it("makes the provider's narration once per text and remakes it when the text changes", async () => {
    process.env.TTS_PROVIDER = JSON.stringify({ url: "https://tts.example.com/v1", token: "k", voices: { ar: "ar-voice" } });
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const b = JSON.parse(String(init.body));
      expect(b).toMatchObject({ lang: "ar", voice: "ar-voice", format: "mp3" });
      return new Response(new Uint8Array(MP3), { headers: { "content-type": "audio/mpeg" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const v = (await tourView("ulh-alula", "ar"))!;
    expect(v.stopsList[0].source).toBe("tts");
    expect(v.stopsList[0].audio).toMatch(/^\/api\/audio\/clip\/ulh-alula\/oldtown\/ar\?v=[0-9a-f]{16}$/);
    expect((await stopAudio("ulh-alula", "oldtown", "ar"))!.contentType).toBe("audio/mpeg");
    await stopAudio("ulh-alula", "oldtown", "ar");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const t = (await getTour("ulh-alula"))!;
    await updateTour("ulh-alula", { stops: t.stops.map((s) => ({ id: s.id, scripts: s.id === "oldtown" ? { ar: `${s.scripts.ar} نص إضافي.` } : {} })) });
    await stopAudio("ulh-alula", "oldtown", "ar");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("prefers the team's recording, serves byte ranges and removes it", async () => {
    await expect(addRecording("jed-albalad", "gate", "en", Buffer.from("not audio at all"))).rejects.toThrow(AudioError);
    await addRecording("jed-albalad", "gate", "en", MP3);
    const v = (await tourView("jed-albalad", "en"))!;
    expect(v.stopsList[0].source).toBe("recording");
    const url = new URL(v.stopsList[0].audio!, "http://localhost");
    const params = { params: Promise.resolve({ tour: "jed-albalad", stop: "gate", lang: "en" }) };
    const full = await clipRoute(new Request(url), params);
    expect(full.status).toBe(200);
    expect(full.headers.get("cache-control")).toContain("immutable");
    expect(Buffer.from(await full.arrayBuffer()).equals(MP3)).toBe(true);
    const part = await clipRoute(new Request(url, { headers: { range: "bytes=0-9" } }), params);
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(`bytes 0-9/${MP3.length}`);
    expect((await part.arrayBuffer()).byteLength).toBe(10);
    await removeRecording("jed-albalad", "gate", "en");
    expect((await tourView("jed-albalad", "en"))!.stopsList[0].source).toBe("device");
    expect((await clipRoute(new Request(url), params)).status).toBe(404);
  });

  it("recognises audio files by content", () => {
    expect(sniffAudio(MP3)).toBe("audio/mpeg");
    expect(sniffAudio(Buffer.concat([Buffer.from("OggS"), Buffer.alloc(20)]))).toBe("audio/ogg");
    expect(sniffAudio(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), Buffer.alloc(8)]))).toBe("audio/wav");
    expect(sniffAudio(Buffer.concat([Buffer.alloc(4), Buffer.from("ftypM4A "), Buffer.alloc(8)]))).toBe("audio/mp4");
    expect(sniffAudio(Buffer.from("%PDF-1.7 hello world"))).toBeNull();
  });
});

describe("audio guides: back office", () => {
  it("validates edits, clears the review flag and handles drafts", async () => {
    ai.on = true;
    await tourView("ruh-diriyah", "id");
    const t = (await getTour("ruh-diriyah"))!;
    expect(t.stops[0].machine?.id).toBe(true);
    await expect(updateTour(t.id, { stops: [{ id: t.stops[0].id, scripts: { ar: "" } }] })).rejects.toThrow("scriptRequired");
    await expect(updateTour(t.id, { stops: [{ id: t.stops[0].id, lat: 40 }] })).rejects.toThrow("invalidLocation");
    const up = await updateTour(t.id, { stops: t.stops.map((s, i) => ({ id: s.id, ...(i === 0 ? { approve: ["id"] } : i === 1 ? { scripts: { id: "Teks yang diperbaiki." } } : {}) })) });
    expect(up.stops[0].machine?.id).toBeUndefined();
    expect(up.stops[1].machine?.id).toBeUndefined();
    expect(up.stops[1].scripts.id).toBe("Teks yang diperbaiki.");
    expect(up.stops[2].machine?.id).toBe(true);

    const draft = await createTour({ city: "MKX", mode: "walk", titleAr: "جولة", titleEn: "Tour" });
    expect(draft.status).toBe("draft");
    expect(await tourView(draft.id, "ar")).toBeNull();
    expect(await tourView(draft.id, "ar", { drafts: true })).not.toBeNull();
    await expect(updateTour(draft.id, { status: "published" })).rejects.toThrow("noStops");
    const pub = await updateTour(draft.id, { status: "published", stops: [{ nameAr: "محطة", nameEn: "Stop", lat: 21.42, lng: 39.82, scripts: { ar: "نص", en: "Text" } }] });
    expect(pub.stops[0].radiusM).toBe(60);
    await expect(deleteTour(draft.id)).rejects.toThrow("unpublishFirst");
    await updateTour(draft.id, { status: "draft" });
    await deleteTour(draft.id);
    expect(await getTour(draft.id)).toBeNull();
    await expect(createTour({ city: "XXX", titleAr: "a", titleEn: "b" })).rejects.toThrow("invalidCity");
  });

  it("splits narration into sentences for the device voice", () => {
    expect(speechChunks("First sentence. Second one? Third! In 3.75 riyals.")).toEqual(["First sentence.", "Second one?", "Third!", "In 3.75 riyals."]);
    expect(speechChunks("جملة أولى. جملة ثانية؟ نعم")).toEqual(["جملة أولى.", "جملة ثانية؟", "نعم"]);
  });
});
