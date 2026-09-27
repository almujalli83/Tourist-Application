"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fmt } from "@/i18n";
import { AUDIO_LANG_NAMES, AUDIO_LANGS, isAudioLang, type AudioLang, type TourSummary } from "@/lib/audio/types";
import { cityName } from "@/lib/data/cities";
import { useApp } from "../app-provider";
import { CarIcon, CheckIcon, ClockIcon, HeadphonesIcon, MapPinIcon, UsersIcon } from "../icons";
import { Alert, Badge, Card, Field, Select, Spinner } from "../ui";
import { durationText, saveLang, savedLang } from "./format";
import { readDownloads, registerAudioWorker } from "./offline";

/** Audio tours by city, with the listening language. */
export function AudioTours() {
  const { t, locale } = useApp();
  const a = t.audio;
  const [tours, setTours] = useState<TourSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [city, setCity] = useState("");
  const [lang, setLang] = useState<AudioLang>(locale);
  const [downloaded, setDownloaded] = useState<string[]>([]);

  useEffect(() => {
    registerAudioWorker(locale);
    const l = savedLang();
    if (isAudioLang(l)) setLang(l);
    setDownloaded(Object.keys(readDownloads()));
    const c = new URLSearchParams(location.search).get("city");
    if (c) setCity(c);
    fetch("/api/audio/tours").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setTours(d.tours)).catch(() => setFailed(true));
  }, [locale]);

  const cities = useMemo(() => [...new Set((tours ?? []).map((x) => x.city))], [tours]);
  const shown = (tours ?? []).filter((x) => !city || x.city === city);
  const ar = locale === "ar";

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><HeadphonesIcon className="size-6" /></span>
        <div>
          <h1 className="text-2xl font-bold text-ink">{a.title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">{a.subtitle}</p>
        </div>
      </div>

      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:max-w-2xl">
        <Field label={a.city}>
          <Select value={city} onChange={(e) => setCity(e.target.value)} data-testid="audio-city">
            <option value="">{a.allCities}</option>
            {cities.map((c) => <option key={c} value={c}>{cityName(c, locale)}</option>)}
          </Select>
        </Field>
        <Field label={a.language}>
          <Select value={lang} onChange={(e) => { const l = e.target.value as AudioLang; setLang(l); saveLang(l); }} data-testid="audio-lang">
            {AUDIO_LANGS.map((l) => <option key={l} value={l}>{AUDIO_LANG_NAMES[l]}</option>)}
          </Select>
        </Field>
        <p className="text-xs text-slate-500 sm:col-span-2">{a.autoLangs}</p>
      </Card>

      {failed && <Alert tone="error">{a.loadFailed}</Alert>}
      {!tours && !failed && <div className="grid h-24 place-items-center text-brand-700"><Spinner className="size-6" /></div>}
      {tours && !shown.length && <p className="text-sm text-slate-600">{a.empty}</p>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((x) => (
          <Card key={x.id} className="flex flex-col p-5" data-testid="audio-tour">
            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-brand-700">
              <span className="inline-flex items-center gap-1"><MapPinIcon className="size-4" />{cityName(x.city, locale)}</span>
              {downloaded.includes(x.id) && <Badge tone="brand"><CheckIcon className="size-3.5" />{a.downloaded}</Badge>}
            </div>
            <h2 className="mt-2 text-lg font-bold text-ink">{ar ? x.titleAr : x.titleEn}</h2>
            <p className="mt-1 flex-1 text-sm leading-6 text-slate-600">{ar ? x.summaryAr : x.summaryEn}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1">{x.mode === "drive" ? <CarIcon className="size-4" /> : <UsersIcon className="size-4" />}{x.mode === "drive" ? a.drive : a.walk}</span>
              <span className="inline-flex items-center gap-1"><ClockIcon className="size-4" />{durationText(a, x.minutes)}</span>
              <span>{fmt(a.stops, { n: x.stops })}</span>
              <span>{fmt(a.km, { n: x.km })}</span>
            </div>
            <p className="mt-2 text-xs text-slate-500">{a.langs} {x.langs.map((l) => AUDIO_LANG_NAMES[l]).join(" · ")}</p>
            <Link href={`/${locale}/audio/${x.id}`} className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-700 text-sm font-semibold text-white hover:bg-brand-800" data-testid="audio-start">
              <HeadphonesIcon className="size-4" />{a.start}
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
