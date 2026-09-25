"use client";

import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { SAUDI_CITIES } from "@/lib/data/cities";
import { CITY_CENTERS } from "@/lib/guide/centers";
import { PLACE_CATEGORIES, PLACE_TAGS, type OpeningSlot, type Place } from "@/lib/guide/types";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { RefreshIcon } from "../icons";
import { Alert, Badge, Button, Card, cx, Field, Input, Select, Spinner, Textarea } from "../ui";
import { GuideMap } from "./guide-map";

type Draft = Partial<Omit<Place, "lat" | "lng" | "priceLevel" | "durationMins">> & { lat?: number | string; lng?: number | string; priceLevel?: number | string; durationMins?: number | string };

const EMPTY: Draft = { city: "RUH", category: "landmark", nameAr: "", nameEn: "", descriptionAr: "", descriptionEn: "", tags: [], hours: [], status: "draft" };

/** Back office: guide places — review, edit, publish and import. */
export function AdminGuide() {
  const { t, locale } = useApp();
  const g = t.guide;
  const a = g.admin;
  const ar = locale === "ar";
  const [city, setCity] = useState("RUH");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [officialOn, setOfficialOn] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);

  const errText = (code: string | undefined) => (a.errors as Record<string, string>)[code ?? ""] ?? a.errors.generic;

  const load = useCallback(async () => {
    const params = new URLSearchParams({ city, status, q });
    const res = await fetch(`/api/admin/guide/places?${params}`, { cache: "no-store" });
    setPlaces(res.ok ? (await res.json()).places : []);
  }, [city, status, q]);

  useEffect(() => {
    const id = setTimeout(() => void load(), 250);
    return () => clearTimeout(id);
  }, [load]);

  useEffect(() => {
    fetch("/api/admin/guide/import", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { official: false }))
      .then((d) => setOfficialOn(!!d.official));
  }, []);

  async function call(key: string, url: string, method: string, payload?: unknown) {
    setBusy(key);
    setMsg(null);
    try {
      const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: payload ? JSON.stringify(payload) : undefined });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ tone: "error", text: errText(body.error) });
        return null;
      }
      return body;
    } finally {
      setBusy(null);
    }
  }

  async function runImport(source: "osm" | "official") {
    const r = await call(`import-${source}`, "/api/admin/guide/import", "POST", { city, source });
    if (r) {
      setMsg({ tone: "success", text: fmt(a.imported, { found: r.found, added: r.added, skipped: r.skipped }) });
      setStatus("draft");
      await load();
    }
  }

  async function setPublished(p: Place, published: boolean) {
    if (await call(`pub-${p.id}`, `/api/admin/guide/places/${encodeURIComponent(p.id)}`, "PATCH", { status: published ? "published" : "draft" })) await load();
  }

  async function remove(p: Place) {
    if (!confirm(a.confirmDelete)) return;
    if (await call(`del-${p.id}`, `/api/admin/guide/places/${encodeURIComponent(p.id)}`, "DELETE")) await load();
  }

  async function save() {
    if (!edit) return;
    const r = edit.id
      ? await call("save", `/api/admin/guide/places/${encodeURIComponent(edit.id)}`, "PATCH", edit)
      : await call("save", "/api/admin/guide/places", "POST", edit);
    if (r) {
      setEdit(null);
      setMsg({ tone: "success", text: a.saved });
      await load();
    }
  }

  const cityName = (code: string) => {
    const c = SAUDI_CITIES.find((x) => x.code === code);
    return c ? (ar ? c.ar : c.en) : code;
  };

  return (
    <div className="space-y-6">
      <BackLink href={`/${locale}/admin`} label={t.admin.title} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{a.title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">{a.subtitle}</p>
        </div>
        <Button onClick={() => setEdit({ ...EMPTY, city })}>{a.newPlace}</Button>
      </div>

      <Alert tone="warning">{a.coordsNote}</Alert>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      {edit ? (
        <Editor draft={edit} onChange={setEdit} onCancel={() => setEdit(null)} onSave={save} saving={busy === "save"} />
      ) : (
        <Card className="overflow-hidden">
          <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[1fr_1fr_2fr_auto]">
            <Field label={g.city}>
              <Select value={city} onChange={(e) => setCity(e.target.value)}>
                {SAUDI_CITIES.map((c) => <option key={c.code} value={c.code}>{ar ? c.ar : c.en}</option>)}
              </Select>
            </Field>
            <Field label={a.fields.status}>
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">{a.anyStatus}</option>
                <option value="draft">{a.status.draft}</option>
                <option value="published">{a.status.published}</option>
              </Select>
            </Field>
            <Field label={t.guide.search}>
              <Input value={q} onChange={(e) => setQ(e.target.value)} />
            </Field>
            <div className="flex items-end">
              <Button variant="ghost" onClick={() => void load()} aria-label={t.admin.refresh}><RefreshIcon className="size-4" /></Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
            <Button size="sm" variant="secondary" loading={busy === "import-osm"} onClick={() => runImport("osm")}>{a.importOsm}</Button>
            <Button size="sm" variant="secondary" loading={busy === "import-official"} disabled={!officialOn} onClick={() => runImport("official")}>{a.importOfficial}</Button>
            {!officialOn && <span className="text-xs text-slate-500">{a.officialOff}</span>}
            <span className="ms-auto text-xs text-slate-500">{a.attribution}</span>
          </div>
          {places === null ? (
            <div className="grid place-items-center py-12"><Spinner className="size-6 text-brand-600" /></div>
          ) : places.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">{t.admin.none}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {places.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="admin-place">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{ar ? p.nameAr : p.nameEn} <span className="text-sm font-normal text-slate-500">· {ar ? p.nameEn : p.nameAr}</span></p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{g.categories[p.category]}</span>·<span>{cityName(p.city)}</span>·<span>{g.source[p.source]}</span>
                      <span dir="ltr" className="ltr-nums">{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</span>
                      {!p.descriptionAr && !p.descriptionEn && <Badge tone="amber">{a.fields.descriptionAr} ✗</Badge>}
                    </p>
                  </div>
                  <Badge tone={p.status === "published" ? "brand" : "amber"}>{a.status[p.status]}</Badge>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEdit({ ...p })}>{a.edit}</Button>
                    <Button size="sm" variant={p.status === "published" ? "secondary" : "primary"} loading={busy === `pub-${p.id}`} onClick={() => setPublished(p, p.status !== "published")}>
                      {p.status === "published" ? a.unpublish : a.publish}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-700" loading={busy === `del-${p.id}`} onClick={() => remove(p)}>{a.delete}</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function Editor({ draft: d, onChange, onCancel, onSave, saving }: { draft: Draft; onChange: (d: Draft) => void; onCancel: () => void; onSave: () => void; saving: boolean }) {
  const { t, locale } = useApp();
  const g = t.guide;
  const f = g.admin.fields;
  const ar = locale === "ar";
  const set = (patch: Partial<Draft>) => onChange({ ...d, ...patch });
  const hours = d.hours ?? [];
  const setSlot = (i: number, patch: Partial<OpeningSlot>) => set({ hours: hours.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const lat = Number(d.lat);
  const lng = Number(d.lng);
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng) && d.lat !== undefined && d.lat !== "" && d.lng !== "";
  const center = CITY_CENTERS[d.city ?? "RUH"] ?? CITY_CENTERS.RUH;

  return (
    <Card className="space-y-5 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={f.nameAr} required><Input dir="rtl" value={d.nameAr ?? ""} onChange={(e) => set({ nameAr: e.target.value })} /></Field>
        <Field label={f.nameEn} required><Input dir="ltr" value={d.nameEn ?? ""} onChange={(e) => set({ nameEn: e.target.value })} /></Field>
        <Field label={f.city}>
          <Select value={d.city} onChange={(e) => set({ city: e.target.value })}>
            {SAUDI_CITIES.map((c) => <option key={c.code} value={c.code}>{ar ? c.ar : c.en}</option>)}
          </Select>
        </Field>
        <Field label={f.category}>
          <Select value={d.category} onChange={(e) => set({ category: e.target.value as Place["category"] })}>
            {PLACE_CATEGORIES.map((c) => <option key={c} value={c}>{g.categories[c]}</option>)}
          </Select>
        </Field>
        <Field label={f.descriptionAr}><Textarea dir="rtl" value={d.descriptionAr ?? ""} onChange={(e) => set({ descriptionAr: e.target.value })} /></Field>
        <Field label={f.descriptionEn}><Textarea dir="ltr" value={d.descriptionEn ?? ""} onChange={(e) => set({ descriptionEn: e.target.value })} /></Field>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="grid content-start gap-4 sm:grid-cols-2">
          <Field label={f.lat} required><Input dir="ltr" inputMode="decimal" value={d.lat ?? ""} onChange={(e) => set({ lat: e.target.value })} /></Field>
          <Field label={f.lng} required><Input dir="ltr" inputMode="decimal" value={d.lng ?? ""} onChange={(e) => set({ lng: e.target.value })} /></Field>
          <p className="text-xs text-slate-500 sm:col-span-2">{g.admin.pickOnMap}</p>
        </div>
        <GuideMap
          className="relative h-64 overflow-hidden rounded-xl border border-slate-200"
          points={hasPoint ? [{ id: "edit", lat, lng, category: d.category ?? "landmark", label: d.nameEn || d.nameAr || "" }] : []}
          center={center}
          fitKey={`${d.city}|${hasPoint}`}
          onMapClick={(ll) => set({ lat: Math.round(ll.lat * 1e6) / 1e6, lng: Math.round(ll.lng * 1e6) / 1e6 })}
          unavailableText={g.mapUnavailable}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={f.addressAr}><Input dir="rtl" value={d.addressAr ?? ""} onChange={(e) => set({ addressAr: e.target.value })} /></Field>
        <Field label={f.addressEn}><Input dir="ltr" value={d.addressEn ?? ""} onChange={(e) => set({ addressEn: e.target.value })} /></Field>
        <Field label={f.phone}><Input dir="ltr" value={d.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} /></Field>
        <Field label={f.website}><Input dir="ltr" value={d.website ?? ""} onChange={(e) => set({ website: e.target.value })} /></Field>
        <Field label={f.cuisineAr}><Input dir="rtl" value={d.cuisineAr ?? ""} onChange={(e) => set({ cuisineAr: e.target.value })} /></Field>
        <Field label={f.cuisineEn}><Input dir="ltr" value={d.cuisineEn ?? ""} onChange={(e) => set({ cuisineEn: e.target.value })} /></Field>
        <Field label={f.priceLevel}>
          <Select value={String(d.priceLevel ?? "")} onChange={(e) => set({ priceLevel: e.target.value })}>
            <option value="">—</option>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{g.priceLevels[n]}</option>)}
          </Select>
        </Field>
        <Field label={f.durationMins}><Input dir="ltr" inputMode="numeric" value={d.durationMins ?? ""} onChange={(e) => set({ durationMins: e.target.value })} /></Field>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-slate-700">{f.hours}</legend>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!d.open24h} onChange={(e) => set({ open24h: e.target.checked })} className="size-4 accent-brand-700" /> {f.open24h}
        </label>
        {!d.open24h && (
          <div className="mt-2 space-y-2">
            {hours.map((s, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2">
                {g.days.map((dn, di) => (
                  <label key={di} className={cx("cursor-pointer rounded-md px-2 py-1 text-xs font-semibold", s.days.includes(di) ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600")}>
                    <input type="checkbox" className="sr-only" checked={s.days.includes(di)} onChange={() => setSlot(i, { days: s.days.includes(di) ? s.days.filter((x) => x !== di) : [...s.days, di].sort() })} />
                    {dn}
                  </label>
                ))}
                <input type="time" value={s.open} onChange={(e) => setSlot(i, { open: e.target.value })} className="h-9 rounded-md border border-slate-300 px-2 text-sm" dir="ltr" />
                <span>–</span>
                <input type="time" value={s.close} onChange={(e) => setSlot(i, { close: e.target.value })} className="h-9 rounded-md border border-slate-300 px-2 text-sm" dir="ltr" />
                <Button size="sm" variant="ghost" className="text-red-700" onClick={() => set({ hours: hours.filter((_, j) => j !== i) })}>{g.admin.delete}</Button>
              </div>
            ))}
            <Button size="sm" variant="secondary" onClick={() => set({ hours: [...hours, { days: [0, 1, 2, 3, 4, 5, 6], open: "09:00", close: "22:00" }] })}>{f.addSlot}</Button>
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-slate-700">{f.tags}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {PLACE_TAGS.map((tg) => {
            const on = d.tags?.includes(tg);
            return (
              <label key={tg} className={cx("cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold", on ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 text-slate-700")}>
                <input type="checkbox" className="sr-only" checked={!!on} onChange={() => set({ tags: on ? d.tags!.filter((x) => x !== tg) : [...(d.tags ?? []), tg] })} />
                {g.tags[tg]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-4">
        <Field label={f.status} className="w-48">
          <Select value={d.status} onChange={(e) => set({ status: e.target.value as Place["status"] })}>
            <option value="draft">{g.admin.status.draft}</option>
            <option value="published">{g.admin.status.published}</option>
          </Select>
        </Field>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>{g.admin.cancel}</Button>
          <Button onClick={onSave} loading={saving}>{g.admin.save}</Button>
        </div>
      </div>
    </Card>
  );
}
