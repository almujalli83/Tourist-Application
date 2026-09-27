"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmt } from "@/i18n";
import { AUDIO_LANG_NAMES, AUDIO_LANGS, isAudioLang, type AudioLang, type TourView } from "@/lib/audio/types";
import { cityName } from "@/lib/data/cities";
import { CITY_CENTERS } from "@/lib/guide/centers";
import { directionsLinks, distanceKm } from "@/lib/guide/geo";
import { useApp } from "../app-provider";
import { GuideMap } from "../guide/guide-map";
import { CarIcon, CheckIcon, ChevronIcon, ClockIcon, DirectionsIcon, DownloadIcon, HeadphonesIcon, LocateIcon, PauseIcon, PlayIcon, UsersIcon } from "../icons";
import { Alert, Button, Card, cx, Select, Spinner } from "../ui";
import { distanceText, durationText, saveLang, savedLang, speechChunks } from "./format";
import { downloadTour, offlineSupported, readDownloads, registerAudioWorker, removeDownload, tourUrl } from "./offline";

const SPEEDS = [0.75, 1, 1.25, 1.5];

function pickVoice(lang: AudioLang): SpeechSynthesisVoice | null | undefined {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return undefined; // unknown yet: let the browser choose by language
  const codes = lang === "id" ? ["id", "in"] : [lang];
  const match = voices.filter((v) => codes.some((c) => v.lang.toLowerCase().replace("_", "-").split("-")[0] === c));
  return match.find((v) => v.localService) ?? match[0] ?? null;
}

/** An audio tour: stops on the map, narration (recording, synthetic or device voice), arrival alerts and offline download. */
export function TourPlayer({ id }: { id: string }) {
  const { t, locale } = useApp();
  const a = t.audio;
  const ar = locale === "ar";
  const [lang, setLang] = useState<AudioLang | null>(null);
  const [tour, setTour] = useState<TourView | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [online, setOnline] = useState(true);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [autoNext, setAutoNext] = useState(true);
  const [showText, setShowText] = useState(false);
  const [time, setTime] = useState({ cur: 0, dur: 0 });
  const [chunk, setChunk] = useState({ i: 0, n: 0 });
  const [voiceIssue, setVoiceIssue] = useState<"noVoice" | "noSpeech" | null>(null);
  const [nearby, setNearby] = useState(false);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [locErr, setLocErr] = useState(false);
  const [arrival, setArrival] = useState<number | null>(null);
  const [dl, setDl] = useState<{ state: "none" | "busy" | "done" | "failed"; done: number; total: number }>({ state: "none", done: 0, total: 0 });
  const [canDownload, setCanDownload] = useState(false);

  const audio = useRef<HTMLAudioElement>(null);
  const speech = useRef({ token: 0, pos: 0, stop: -1 });
  const prompted = useRef(new Set<string>());
  const live = useRef({ tour, idx, autoNext, speed, lang });
  live.current = { tour, idx, autoNext, speed, lang };

  // Language: saved choice, else the site's language.
  useEffect(() => {
    registerAudioWorker(locale);
    const l = savedLang();
    setLang(isAudioLang(l) ? l : locale);
    setCanDownload(offlineSupported());
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    // Voices load asynchronously in some browsers.
    window.speechSynthesis?.getVoices();
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.speechSynthesis?.cancel();
    };
  }, [locale]);

  useEffect(() => {
    if (!lang) return;
    let cancelled = false;
    setStatus("loading");
    // The team previews drafts with ?preview=1.
    const preview = new URLSearchParams(location.search).get("preview") === "1";
    fetch(`${tourUrl(id, lang)}${preview ? "&preview=1" : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { tour: TourView }) => {
        if (cancelled) return;
        setTour(preview ? { ...d.tour, stopsList: d.tour.stopsList.map((x) => (x.audio ? { ...x, audio: `${x.audio}&preview=1` } : x)) } : d.tour);
        setStatus("ready");
        const want = new URLSearchParams(location.search).get("stop");
        const i = want ? d.tour.stopsList.findIndex((s) => s.id === want) : -1;
        if (i >= 0) setIdx(i);
        const saved = readDownloads()[id];
        setDl({ state: saved?.lang === lang ? "done" : "none", done: 0, total: 0 });
      })
      .catch(() => !cancelled && setStatus("failed"));
    return () => {
      cancelled = true;
    };
  }, [id, lang]);

  const stopAll = useCallback(() => {
    speech.current.token++;
    window.speechSynthesis?.cancel();
    audio.current?.pause();
    setPlaying(false);
  }, []);

  const onEnded = useCallback(() => {
    setPlaying(false);
    speech.current.pos = 0;
    speech.current.stop = -1;
    const { tour: tr, idx: i, autoNext: auto } = live.current;
    if (auto && tr && i < tr.stopsList.length - 1) {
      // Next stop after a short pause.
      setTimeout(() => playRef.current(i + 1), 800);
    }
  }, []);

  const speak = useCallback((text: string, from: number) => {
    const synth = window.speechSynthesis;
    if (!synth) {
      setVoiceIssue("noSpeech");
      setShowText(true);
      return;
    }
    const { lang: l } = live.current;
    const voice = pickVoice(l!);
    if (voice === null) {
      setVoiceIssue("noVoice");
      setShowText(true);
      return;
    }
    setVoiceIssue(null);
    const chunks = speechChunks(text);
    const token = ++speech.current.token;
    synth.cancel();
    let i = from;
    setChunk({ i, n: chunks.length });
    const next = () => {
      if (token !== speech.current.token) return;
      if (i >= chunks.length) return onEnded();
      const u = new SpeechSynthesisUtterance(chunks[i]);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? l!;
      u.rate = live.current.speed;
      u.onend = () => {
        if (token !== speech.current.token) return;
        i++;
        speech.current.pos = i;
        setChunk({ i, n: chunks.length });
        next();
      };
      u.onerror = (e) => {
        if (token !== speech.current.token || e.error === "interrupted" || e.error === "canceled") return;
        setPlaying(false);
        setVoiceIssue("noVoice");
        setShowText(true);
      };
      synth.speak(u);
    };
    setPlaying(true);
    next();
  }, [onEnded]);

  const play = useCallback((i: number) => {
    const tr = live.current.tour;
    const s = tr?.stopsList[i];
    if (!tr || !s) return;
    stopAll();
    setIdx(i);
    setArrival(null);
    if ("mediaSession" in navigator && typeof MediaMetadata !== "undefined") {
      navigator.mediaSession.metadata = new MediaMetadata({ title: ar ? s.nameAr : s.nameEn, artist: ar ? tr.titleAr : tr.titleEn, album: t.audio.title });
    }
    if (s.audio && audio.current) {
      const el = audio.current;
      if (!el.src.endsWith(s.audio)) el.src = s.audio;
      el.playbackRate = live.current.speed;
      el.play().then(() => setPlaying(true)).catch(() => {
        // Audio file unavailable (e.g. offline and not downloaded): read the text instead.
        if (s.text) speak(s.text, 0);
      });
    } else if (s.text) {
      speech.current.stop = i;
      speak(s.text, 0);
    }
  }, [ar, speak, stopAll, t.audio.title]);
  const playRef = useRef(play);
  playRef.current = play;

  function toggle() {
    const s = tour?.stopsList[idx];
    if (!s) return;
    if (playing) {
      if (s.audio && audio.current && !audio.current.paused) audio.current.pause();
      else {
        speech.current.token++;
        window.speechSynthesis?.cancel();
      }
      setPlaying(false);
      return;
    }
    // Resume where it stopped.
    if (s.audio && audio.current?.src.endsWith(s.audio) && audio.current.currentTime > 0 && !audio.current.ended) {
      audio.current.play().then(() => setPlaying(true)).catch(() => undefined);
    } else if (!s.audio && s.text && speech.current.stop === idx && speech.current.pos > 0) {
      speak(s.text, speech.current.pos);
    } else {
      speech.current.pos = 0;
      play(idx);
    }
  }

  // Lock-screen / headset controls.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler("previoustrack", () => playRef.current(Math.max(0, live.current.idx - 1)));
    ms.setActionHandler("nexttrack", () => {
      const n = live.current.tour?.stopsList.length ?? 0;
      if (live.current.idx < n - 1) playRef.current(live.current.idx + 1);
    });
    return () => {
      ms.setActionHandler("previoustrack", null);
      ms.setActionHandler("nexttrack", null);
    };
  }, []);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed]);

  // Arrival alerts.
  useEffect(() => {
    if (!nearby) return;
    if (!navigator.geolocation) {
      setLocErr(true);
      setNearby(false);
      return;
    }
    setLocErr(false);
    const w = navigator.geolocation.watchPosition(
      (p) => setMe({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {
        setLocErr(true);
        setNearby(false);
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(w);
  }, [nearby]);

  useEffect(() => {
    if (!me || !tour || !nearby) return;
    const i = tour.stopsList.findIndex((s) => !prompted.current.has(s.id) && distanceKm(me, s) * 1000 <= s.radiusM);
    if (i < 0) return;
    prompted.current.add(tour.stopsList[i].id);
    if (playing && i === idx) return;
    setArrival(i);
    navigator.vibrate?.(200);
  }, [me, tour, nearby, playing, idx]);

  async function download() {
    if (!tour) return;
    setDl({ state: "busy", done: 0, total: 1 });
    try {
      await downloadTour(tour, locale, (done, total) => setDl({ state: "busy", done, total }));
      setDl({ state: "done", done: 0, total: 0 });
    } catch {
      setDl({ state: "failed", done: 0, total: 0 });
    }
  }

  async function undownload() {
    await removeDownload(id);
    setDl({ state: "none", done: 0, total: 0 });
  }

  function changeLang(l: AudioLang) {
    stopAll();
    speech.current.pos = 0;
    speech.current.stop = -1;
    if (audio.current) audio.current.removeAttribute("src");
    setTime({ cur: 0, dur: 0 });
    saveLang(l);
    setLang(l);
  }

  const back = (
    <Link href={`/${locale}/audio`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-900">
      <ChevronIcon className="size-4 rotate-180 rtl:rotate-0" /> {a.back}
    </Link>
  );

  if (status === "failed" && !tour) return <div className="space-y-4">{back}<Alert tone="error">{a.loadFailed}</Alert></div>;
  if (!tour || !lang) {
    return (
      <div className="space-y-4">
        {back}
        <div className="grid h-40 place-items-center gap-2 text-brand-700">
          <Spinner className="size-6" />
          {lang && lang !== "ar" && lang !== "en" && <p className="text-sm text-slate-600">{a.translating}</p>}
        </div>
      </div>
    );
  }

  const s = tour.stopsList[idx];
  const n = tour.stopsList.length;
  const center = CITY_CENTERS[tour.city] ?? { lat: s.lat, lng: s.lng, zoom: 12 };
  const name = (x: { nameAr: string; nameEn: string }) => (ar ? x.nameAr : x.nameEn);
  const mmss = (v: number) => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, "0")}`;

  return (
    <div className="space-y-5" data-testid="audio-player">
      {back}
      <div>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-brand-700">
          <span>{cityName(tour.city, locale)}</span>
          <span className="inline-flex items-center gap-1">{tour.mode === "drive" ? <CarIcon className="size-4" /> : <UsersIcon className="size-4" />}{tour.mode === "drive" ? a.drive : a.walk}</span>
          <span className="inline-flex items-center gap-1"><ClockIcon className="size-4" />{durationText(a, tour.minutes)}</span>
          <span>{fmt(a.km, { n: tour.km })}</span>
        </p>
        <h1 className="mt-1 text-2xl font-bold text-ink">{ar ? tour.titleAr : tour.titleEn}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{ar ? tour.summaryAr : tour.summaryEn}</p>
      </div>

      {!online && <Alert tone="warning">{a.offline}</Alert>}
      {status === "loading" && <div className="flex items-center gap-2 text-sm text-slate-600"><Spinner className="size-4" />{lang !== "ar" && lang !== "en" ? a.translating : ""}</div>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          {/* Player */}
          <Card className="space-y-4 p-4" data-testid="audio-now">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-500">{fmt(a.stopOf, { i: idx + 1, n })}</p>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                {a.language}
                <span className="w-40">
                  <Select value={lang} onChange={(e) => changeLang(e.target.value as AudioLang)} className="h-9 py-1 text-sm" data-testid="audio-player-lang">
                    {AUDIO_LANGS.map((l) => <option key={l} value={l}>{AUDIO_LANG_NAMES[l]}</option>)}
                  </Select>
                </span>
              </label>
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink" data-testid="audio-stop-name">{name(s)}</h2>
              <p className="mt-0.5 text-xs text-slate-500">{a.source[s.source]}{me && ` · ${fmt(a.away, { v: distanceText(a, distanceKm(me, s)) })}`}</p>
            </div>
            {!s.text && <Alert tone="warning">{a.notAvailable}</Alert>}
            {s.machine && <p className="text-xs text-amber-700">{a.machine}</p>}
            {voiceIssue && <Alert tone="warning">{voiceIssue === "noVoice" ? a.noVoice : a.noSpeech}</Alert>}

            <audio
              ref={audio}
              preload="none"
              onTimeUpdate={(e) => setTime({ cur: e.currentTarget.currentTime, dur: e.currentTarget.duration || 0 })}
              onLoadedMetadata={(e) => setTime({ cur: 0, dur: e.currentTarget.duration || 0 })}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={onEnded}
              className="hidden"
            />
            {s.audio ? (
              <div className="flex items-center gap-2 text-xs text-slate-500" dir="ltr">
                <span className="w-10 tabular-nums">{mmss(time.cur)}</span>
                <input
                  type="range" min={0} max={time.dur || 0} step={0.5} value={Math.min(time.cur, time.dur || 0)} aria-label={a.play}
                  onChange={(e) => { if (audio.current) audio.current.currentTime = Number(e.target.value); }}
                  className="h-1.5 flex-1 accent-brand-700"
                />
                <span className="w-10 text-end tabular-nums">{mmss(time.dur)}</span>
              </div>
            ) : (
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-brand-700 transition-all" style={{ width: `${speech.current.stop === idx && chunk.n ? (chunk.i / chunk.n) * 100 : 0}%` }} />
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <button type="button" onClick={() => play(Math.max(0, idx - 1))} disabled={idx === 0} aria-label={a.prev} className="grid size-11 place-items-center rounded-full text-brand-800 ring-1 ring-brand-700/25 hover:bg-brand-50 disabled:opacity-40">
                <ChevronIcon className="size-5 rotate-180 rtl:rotate-0" />
              </button>
              <button type="button" onClick={toggle} disabled={!s.text && !s.audio} aria-label={playing ? a.pause : a.play} className="grid size-14 place-items-center rounded-full bg-brand-700 text-white shadow hover:bg-brand-800 disabled:opacity-40" data-testid="audio-toggle" data-playing={playing ? "1" : "0"}>
                {playing ? <PauseIcon className="size-6" /> : <PlayIcon className="size-6" />}
              </button>
              <button type="button" onClick={() => play(Math.min(n - 1, idx + 1))} disabled={idx >= n - 1} aria-label={a.next} className="grid size-11 place-items-center rounded-full text-brand-800 ring-1 ring-brand-700/25 hover:bg-brand-50 disabled:opacity-40" data-testid="audio-next">
                <ChevronIcon className="size-5 rtl:rotate-180" />
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-1" role="group" aria-label={a.speed}>
                <span className="font-semibold text-slate-600">{a.speed}:</span>
                {SPEEDS.map((v) => (
                  <button key={v} type="button" onClick={() => setSpeed(v)} aria-pressed={speed === v} className={cx("rounded-md px-2 py-1 font-semibold tabular-nums", speed === v ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100")} dir="ltr">
                    {v}×
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 font-semibold text-slate-600">
                <input type="checkbox" className="accent-brand-700" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} />{a.autoNext}
              </label>
            </div>

            {s.text && (
              <div>
                <button type="button" onClick={() => setShowText(!showText)} className="text-sm font-semibold text-brand-700 hover:underline" data-testid="audio-text-toggle">
                  {showText ? a.hideText : a.showText}
                </button>
                {showText && <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-700" dir={lang === "ar" || lang === "ur" ? "rtl" : "ltr"} lang={lang} data-testid="audio-text">{s.text}</p>}
              </div>
            )}
          </Card>

          {/* Arrival alerts & offline */}
          <Card className="space-y-3 p-4">
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 accent-brand-700" checked={nearby} onChange={(e) => setNearby(e.target.checked)} data-testid="audio-nearby" />
              <span>
                <span className="flex items-center gap-1.5 text-sm font-semibold text-ink"><LocateIcon className="size-4" />{a.nearby}</span>
                <span className="block text-xs text-slate-500">{a.nearbyHint}</span>
              </span>
            </label>
            {locErr && <p className="text-xs text-red-700">{a.locationDenied}</p>}
            {canDownload && (
              <div className="border-t border-slate-100 pt-3">
                {dl.state === "done" ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-800" data-testid="audio-downloaded"><CheckIcon className="size-4" />{a.downloadedOk}</p>
                    <button type="button" onClick={() => void undownload()} className="text-xs font-semibold text-red-700 hover:underline">{a.removeDownload}</button>
                  </div>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => void download()} loading={dl.state === "busy"} disabled={!online} data-testid="audio-download">
                    <DownloadIcon className="size-4" />{dl.state === "busy" ? `${a.downloading} ${dl.done}/${dl.total}` : a.download}
                  </Button>
                )}
                {dl.state === "failed" && <p className="mt-2 text-xs text-red-700">{a.downloadFailed}</p>}
                {tour.stopsList.some((x) => x.source === "device") && <p className="mt-2 text-xs text-slate-500">{a.offlineVoice}</p>}
              </div>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="relative h-72 overflow-hidden rounded-xl ring-1 ring-slate-200 lg:h-80">
            <GuideMap
              className="absolute inset-0"
              points={tour.stopsList.map((x, i) => ({ id: x.id, lat: x.lat, lng: x.lng, category: "landmark" as const, label: name(x), badge: String(i + 1) }))}
              route={tour.stopsList}
              selectedId={s.id}
              onSelect={(sid) => setIdx(tour.stopsList.findIndex((x) => x.id === sid))}
              center={center}
              fitKey={tour.id}
              userLocation={me}
              unavailableText={a.mapUnavailable}
            />
          </div>
          <ol className="space-y-2" data-testid="audio-stops">
            {tour.stopsList.map((x, i) => (
              <li key={x.id}>
                <div className={cx("flex items-center gap-3 rounded-xl border p-3", i === idx ? "border-brand-600 bg-brand-50" : "border-slate-200 bg-white")}>
                  <button type="button" onClick={() => play(i)} className="flex min-w-0 flex-1 items-center gap-3 text-start" data-testid="audio-stop">
                    <span className={cx("grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold", i === idx ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-700")}>{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">{name(x)}</span>
                      <span className="block text-xs text-slate-500">
                        {me ? fmt(a.away, { v: distanceText(a, distanceKm(me, x)) }) : a.source[x.source]}
                        {!x.text && ` · ${AUDIO_LANG_NAMES[lang]} ✕`}
                      </span>
                    </span>
                  </button>
                  {i === idx && playing && <HeadphonesIcon className="size-4 shrink-0 text-brand-700" />}
                  <a href={directionsLinks(x).google} target="_blank" rel="noopener noreferrer" aria-label={a.directions} title={a.directions} className="grid size-9 shrink-0 place-items-center rounded-full text-brand-700 hover:bg-brand-100">
                    <DirectionsIcon className="size-4" />
                  </a>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {arrival !== null && tour.stopsList[arrival] && (
        <div className="fixed inset-x-3 bottom-4 z-40 mx-auto max-w-md rounded-2xl bg-ink p-4 text-white shadow-2xl" role="alertdialog" aria-live="assertive" data-testid="audio-arrival">
          <p className="flex items-center gap-2 font-semibold"><MapPinDot />{fmt(a.arrived, { name: name(tour.stopsList[arrival]) })}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => play(arrival)} data-testid="audio-arrival-play"><PlayIcon className="size-4" />{a.listen}</Button>
            <Button size="sm" variant="secondary" onClick={() => setArrival(null)}>{a.later}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

const MapPinDot = () => <span className="inline-block size-2.5 rounded-full bg-gold-400" aria-hidden />;
