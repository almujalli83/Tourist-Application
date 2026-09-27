"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { AUDIO_LANG_NAMES, AUDIO_LANGS, type AudioLang, type AudioTour } from "@/lib/audio/types";
import { cityName } from "@/lib/data/cities";
import { CITY_CENTERS } from "@/lib/guide/centers";
import { useApp } from "../app-provider";
import { Alert, Badge, Button, Card, cx, Field, Input, Select, Spinner, Textarea } from "../ui";

type Stop = AudioTour["stops"][number] & { approve?: AudioLang[]; isNew?: boolean };
type Draft = Omit<AudioTour, "stops"> & { stops: Stop[] };

/** Operations: audio tours — texts per language, review of machine translations, recordings, publishing. */
export function AdminAudio() {
  const { t, locale } = useApp();
  const a = t.audio.admin;
  const [tours, setTours] = useState<AudioTour[] | null>(null);
  const [flags, setFlags] = useState({ tts: false, ai: false });
  const [open, setOpen] = useState<Draft | null>(null);
  const [lang, setLang] = useState<AudioLang>("ar");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [nt, setNt] = useState({ city: "RUH", mode: "walk" as AudioTour["mode"], titleAr: "", titleEn: "" });

  const errText = (code?: string) => (a.errors as Record<string, string>)[code ?? ""] ?? a.errors.generic;
  const load = () =>
    fetch("/api/admin/audio", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      setTours(d.tours);
      setFlags({ tts: d.tts, ai: d.ai });
      return d.tours as AudioTour[];
    });
  useEffect(() => {
    void load();
  }, []);

  if (!tours) return <div className="grid h-24 place-items-center text-brand-700"><Spinner className="size-6" /></div>;

  const replaceTour = (tour: AudioTour) => {
    setTours((all) => (all ?? []).map((x) => (x.id === tour.id ? tour : x)));
    setOpen((cur) => (cur && cur.id === tour.id ? structuredClone(tour) : cur));
  };

  async function create() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/admin/audio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(nt) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "error", text: errText(d.error) });
    setTours([...(tours ?? []), d.tour]);
    setOpen(structuredClone(d.tour));
    setNt({ ...nt, titleAr: "", titleEn: "" });
  }

  async function save() {
    if (!open) return;
    setBusy(true);
    setMsg(null);
    const payload = {
      city: open.city, mode: open.mode, titleAr: open.titleAr, titleEn: open.titleEn, summaryAr: open.summaryAr, summaryEn: open.summaryEn,
      minutes: open.minutes, status: open.status,
      stops: open.stops.map((s) => ({ id: s.isNew ? undefined : s.id, nameAr: s.nameAr, nameEn: s.nameEn, lat: Number(s.lat), lng: Number(s.lng), radiusM: Number(s.radiusM), scripts: s.scripts, approve: s.approve })),
    };
    const r = await fetch(`/api/admin/audio/${open.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "error", text: errText(d.error) });
    replaceTour(d.tour);
    setMsg({ tone: "success", text: a.saved });
  }

  async function translate() {
    if (!open) return;
    setBusy(true);
    setMsg(null);
    const r = await fetch(`/api/admin/audio/${open.id}/translate`, { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "error", text: errText(d.error) });
    replaceTour(d.tour);
    setMsg({ tone: "success", text: fmt(a.translated, { n: d.translated }) });
  }

  async function remove() {
    if (!open || !confirm(a.confirmRemove)) return;
    const r = await fetch(`/api/admin/audio/${open.id}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg({ tone: "error", text: errText(d.error) });
    setTours(tours!.filter((x) => x.id !== open.id));
    setOpen(null);
  }

  async function upload(stopId: string, file: File | undefined) {
    if (!open || !file) return;
    setBusy(true);
    setMsg(null);
    const form = new FormData();
    form.set("stop", stopId);
    form.set("lang", lang);
    form.set("file", file);
    const r = await fetch(`/api/admin/audio/${open.id}/recording`, { method: "POST", body: form });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "error", text: errText(d.error) });
    replaceTour(d.tour);
    setMsg({ tone: "success", text: a.uploaded });
  }

  async function unrecord(stopId: string) {
    if (!open) return;
    const r = await fetch(`/api/admin/audio/${open.id}/recording?stop=${encodeURIComponent(stopId)}&lang=${lang}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    if (r.ok) replaceTour(d.tour);
  }

  const upd = (patch: Partial<Draft>) => setOpen((o) => (o ? { ...o, ...patch } : o));
  const updStop = (i: number, patch: Partial<Stop>) => setOpen((o) => (o ? { ...o, stops: o.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : o));
  const move = (i: number, d: -1 | 1) => setOpen((o) => {
    if (!o || i + d < 0 || i + d >= o.stops.length) return o;
    const stops = [...o.stops];
    [stops[i], stops[i + d]] = [stops[i + d], stops[i]];
    return { ...o, stops };
  });
  const missing = (x: AudioTour) => AUDIO_LANGS.filter((l) => x.stops.some((s) => !s.scripts[l]));
  const toReview = (x: AudioTour) => x.stops.reduce((n, s) => n + Object.keys(s.machine ?? {}).length, 0);
  const ar = locale === "ar";

  return (
    <section className="space-y-5" data-testid="admin-audio">
      <div>
        <h1 className="text-2xl font-bold text-ink">{a.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{a.intro}</p>
      </div>
      <Alert tone={flags.tts ? "success" : "info"}>{flags.tts ? a.ttsOn : a.ttsOff}</Alert>
      {!flags.ai && <Alert tone="warning">{a.aiOff}</Alert>}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {tours.map((x) => (
          <Card key={x.id} className={cx("space-y-2 p-4", open?.id === x.id && "ring-2 ring-brand-600")} data-testid="admin-audio-tour">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-brand-700">{cityName(x.city, locale)}</span>
              <Badge tone={x.status === "published" ? "brand" : "slate"}>{a.status[x.status]}</Badge>
            </div>
            <p className="font-bold text-ink">{ar ? x.titleAr : x.titleEn}</p>
            <p className="text-xs text-slate-500">
              {fmt(t.audio.stops, { n: x.stops.length })}
              {missing(x).length > 0 && ` · ${fmt(a.missing, { langs: missing(x).map((l) => AUDIO_LANG_NAMES[l]).join("، ") })}`}
              {toReview(x) > 0 && ` · ${fmt(a.review, { n: toReview(x) })}`}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => { setOpen(open?.id === x.id ? null : structuredClone(x)); setMsg(null); }} data-testid="admin-audio-edit">
                {open?.id === x.id ? a.close : a.edit}
              </Button>
              <Link href={`/${locale}/audio/${x.id}?preview=1`} className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50">{a.preview}</Link>
            </div>
          </Card>
        ))}
      </div>

      <Card className="space-y-3 p-4">
        <h2 className="font-bold text-ink">{a.newTour}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={a.city}>
            <Select value={nt.city} onChange={(e) => setNt({ ...nt, city: e.target.value })}>
              {Object.keys(CITY_CENTERS).map((c) => <option key={c} value={c}>{cityName(c, locale)}</option>)}
            </Select>
          </Field>
          <Field label={a.mode}>
            <Select value={nt.mode} onChange={(e) => setNt({ ...nt, mode: e.target.value as AudioTour["mode"] })}>
              <option value="walk">{t.audio.walk}</option>
              <option value="drive">{t.audio.drive}</option>
            </Select>
          </Field>
          <Field label={a.titleAr}><Input value={nt.titleAr} onChange={(e) => setNt({ ...nt, titleAr: e.target.value })} dir="rtl" data-testid="admin-audio-new-ar" /></Field>
          <Field label={a.titleEn}><Input value={nt.titleEn} onChange={(e) => setNt({ ...nt, titleEn: e.target.value })} dir="ltr" data-testid="admin-audio-new-en" /></Field>
        </div>
        <Button size="sm" onClick={() => void create()} disabled={busy || !nt.titleAr.trim() || !nt.titleEn.trim()} data-testid="admin-audio-create">{a.create}</Button>
      </Card>

      {open && (
        <Card className="space-y-4 p-4" data-testid="admin-audio-editor">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={a.titleAr}><Input value={open.titleAr} onChange={(e) => upd({ titleAr: e.target.value })} dir="rtl" /></Field>
            <Field label={a.titleEn}><Input value={open.titleEn} onChange={(e) => upd({ titleEn: e.target.value })} dir="ltr" /></Field>
            <Field label={a.summaryAr}><Textarea rows={2} value={open.summaryAr} onChange={(e) => upd({ summaryAr: e.target.value })} dir="rtl" /></Field>
            <Field label={a.summaryEn}><Textarea rows={2} value={open.summaryEn} onChange={(e) => upd({ summaryEn: e.target.value })} dir="ltr" /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={a.mode}>
              <Select value={open.mode} onChange={(e) => upd({ mode: e.target.value as AudioTour["mode"] })}>
                <option value="walk">{t.audio.walk}</option>
                <option value="drive">{t.audio.drive}</option>
              </Select>
            </Field>
            <Field label={a.minutes}><Input type="number" min={10} max={1440} value={open.minutes} onChange={(e) => upd({ minutes: Number(e.target.value) })} /></Field>
            <label className="flex items-center gap-2 self-end pb-3 text-sm font-semibold">
              <input type="checkbox" className="accent-brand-700" checked={open.status === "published"} onChange={(e) => upd({ status: e.target.checked ? "published" : "draft" })} data-testid="admin-audio-published" />{a.published}
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
            <h3 className="font-bold text-ink">{a.stops}</h3>
            <div className="flex flex-wrap gap-1" role="tablist">
              {AUDIO_LANGS.map((l) => (
                <button key={l} type="button" role="tab" aria-selected={lang === l} onClick={() => setLang(l)} className={cx("rounded-md px-2.5 py-1 text-xs font-semibold", lang === l ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")} data-testid={`admin-audio-lang-${l}`}>
                  {AUDIO_LANG_NAMES[l]}
                </button>
              ))}
            </div>
          </div>

          <ol className="space-y-3">
            {open.stops.map((s, i) => {
              const machine = !!s.machine?.[lang] && !s.approve?.includes(lang);
              const rec = s.recordings?.[lang];
              return (
                <li key={s.id} className="space-y-3 rounded-xl border border-slate-200 p-3" data-testid="admin-audio-stop">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="grid size-7 place-items-center rounded-full bg-slate-100 text-sm font-bold">{i + 1}</span>
                    <div className="flex gap-1 text-xs font-semibold">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-40">{a.up}</button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === open.stops.length - 1} className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-40">{a.down}</button>
                      <button type="button" onClick={() => upd({ stops: open.stops.filter((_, j) => j !== i) })} className="rounded px-2 py-1 text-red-700 hover:bg-red-50">{a.removeStop}</button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <Field label={a.nameAr}><Input value={s.nameAr} onChange={(e) => updStop(i, { nameAr: e.target.value })} dir="rtl" /></Field>
                    <Field label={a.nameEn}><Input value={s.nameEn} onChange={(e) => updStop(i, { nameEn: e.target.value })} dir="ltr" /></Field>
                    <Field label={a.lat}><Input type="number" step="0.0001" value={s.lat} onChange={(e) => updStop(i, { lat: Number(e.target.value) })} dir="ltr" /></Field>
                    <Field label={a.lng}><Input type="number" step="0.0001" value={s.lng} onChange={(e) => updStop(i, { lng: Number(e.target.value) })} dir="ltr" /></Field>
                    <Field label={a.radius}><Input type="number" min={20} max={3000} value={s.radiusM} onChange={(e) => updStop(i, { radiusM: Number(e.target.value) })} dir="ltr" /></Field>
                  </div>
                  <Field label={`${a.text} — ${AUDIO_LANG_NAMES[lang]}`}>
                    <Textarea
                      rows={5}
                      value={s.scripts[lang] ?? ""}
                      onChange={(e) => updStop(i, { scripts: { ...s.scripts, [lang]: e.target.value } })}
                      dir={lang === "ar" || lang === "ur" ? "rtl" : "ltr"}
                      data-testid="admin-audio-script"
                    />
                  </Field>
                  {machine && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="amber">{a.machine}</Badge>
                      <button type="button" onClick={() => updStop(i, { approve: [...(s.approve ?? []), lang] })} className="text-xs font-semibold text-brand-700 hover:underline" data-testid="admin-audio-approve">{a.approve}</button>
                    </div>
                  )}
                  {!s.isNew && (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold">{a.recording}:</span>
                      {rec ? (
                        <>
                          <Badge tone="brand">{a.hasRecording}</Badge>
                          <audio controls preload="none" src={`/api/audio/clip/${open.id}/${s.id}/${lang}?preview=1&v=${rec.slice(0, 12)}`} className="h-8 max-w-full" />
                          <button type="button" onClick={() => void unrecord(s.id)} className="text-xs font-semibold text-red-700 hover:underline">{a.removeRecording}</button>
                        </>
                      ) : (
                        <label className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-white px-3 text-xs font-semibold text-brand-800 ring-1 ring-brand-700/25 hover:bg-brand-50">
                          {a.upload}
                          <input type="file" accept="audio/*" className="sr-only" onChange={(e) => void upload(s.id, e.target.files?.[0])} data-testid="admin-audio-upload" />
                        </label>
                      )}
                      <span className="text-xs text-slate-500">{a.recordingHint}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <Button
            size="sm" variant="secondary"
            onClick={() => {
              const c = CITY_CENTERS[open.city];
              upd({ stops: [...open.stops, { id: `new-${Date.now()}`, isNew: true, nameAr: "", nameEn: "", lat: c?.lat ?? 24.7, lng: c?.lng ?? 46.7, radiusM: open.mode === "walk" ? 60 : 400, scripts: {} }] });
            }}
            data-testid="admin-audio-add-stop"
          >
            {a.addStop}
          </Button>

          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <Button onClick={() => void save()} loading={busy} data-testid="admin-audio-save">{a.save}</Button>
            <Button variant="secondary" onClick={() => void translate()} disabled={busy || !flags.ai}>{a.translate}</Button>
            {open.status === "draft" && <Button variant="secondary" onClick={() => void remove()} className="text-red-700">{a.remove}</Button>}
          </div>
        </Card>
      )}
    </section>
  );
}
