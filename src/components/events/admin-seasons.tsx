"use client";

import { useCallback, useEffect, useState } from "react";
import { SAUDI_CITIES } from "@/lib/data/cities";
import { fmtDay } from "@/lib/events/format";
import type { Season } from "@/lib/events/types";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { Alert, Badge, Button, Card, cx, Field, Input, Select, Spinner, Textarea } from "../ui";

type Draft = Partial<Season> & { isNew?: boolean };

/** Back office: Saudi seasons shown on the events page. */
export function AdminSeasons() {
  const { t, locale } = useApp();
  const a = t.events.admin;
  const ar = locale === "ar";
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/seasons", { cache: "no-store" });
    setSeasons(r.ok ? (await r.json()).seasons : []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function call(url: string, method: string, payload?: unknown) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: payload ? JSON.stringify(payload) : undefined });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg({ tone: "error", text: (a.errors as Record<string, string>)[body.error] ?? a.errors.generic });
        return false;
      }
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!edit) return;
    const ok = edit.isNew ? await call("/api/admin/seasons", "POST", edit) : await call(`/api/admin/seasons/${encodeURIComponent(edit.id!)}`, "PATCH", edit);
    if (ok) {
      setEdit(null);
      setMsg({ tone: "success", text: a.saved });
      await load();
    }
  }

  async function remove(s: Season) {
    if (!confirm(a.confirmDelete)) return;
    if (await call(`/api/admin/seasons/${encodeURIComponent(s.id)}`, "DELETE")) await load();
  }

  const cityName = (c: string) => {
    const x = SAUDI_CITIES.find((y) => y.code === c);
    return x ? (ar ? x.ar : x.en) : c;
  };

  return (
    <div className="space-y-6">
      <BackLink href={`/${locale}/admin`} label={t.admin.title} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{a.title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">{a.subtitle}</p>
        </div>
        <Button onClick={() => setEdit({ isNew: true, cities: [], color: "#0f766e", status: "published" })}>{a.add}</Button>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      {edit ? (
        <Card className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {edit.isNew && (
              <Field label={a.fields.id} hint="riyadh-season">
                <Input dir="ltr" value={edit.id ?? ""} onChange={(e) => setEdit({ ...edit, id: e.target.value })} />
              </Field>
            )}
            <Field label={a.fields.nameAr} required><Input dir="rtl" value={edit.nameAr ?? ""} onChange={(e) => setEdit({ ...edit, nameAr: e.target.value })} /></Field>
            <Field label={a.fields.nameEn} required><Input dir="ltr" value={edit.nameEn ?? ""} onChange={(e) => setEdit({ ...edit, nameEn: e.target.value })} /></Field>
            <Field label={a.fields.descriptionAr}><Textarea dir="rtl" value={edit.descriptionAr ?? ""} onChange={(e) => setEdit({ ...edit, descriptionAr: e.target.value })} /></Field>
            <Field label={a.fields.descriptionEn}><Textarea dir="ltr" value={edit.descriptionEn ?? ""} onChange={(e) => setEdit({ ...edit, descriptionEn: e.target.value })} /></Field>
            <Field label={a.fields.startDate} required><Input type="date" dir="ltr" value={edit.startDate ?? ""} onChange={(e) => setEdit({ ...edit, startDate: e.target.value })} /></Field>
            <Field label={a.fields.endDate} required><Input type="date" dir="ltr" value={edit.endDate ?? ""} onChange={(e) => setEdit({ ...edit, endDate: e.target.value })} /></Field>
            <Field label={a.fields.color}><Input type="color" className="h-11 w-24 p-1" value={edit.color ?? "#0f766e"} onChange={(e) => setEdit({ ...edit, color: e.target.value })} /></Field>
            <Field label={a.fields.status}>
              <Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as Season["status"] })}>
                <option value="published">{a.status.published}</option>
                <option value="hidden">{a.status.hidden}</option>
              </Select>
            </Field>
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">{a.fields.cities}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {SAUDI_CITIES.map((c) => {
                const on = edit.cities?.includes(c.code);
                return (
                  <label key={c.code} className={cx("cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold", on ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 text-slate-700")}>
                    <input type="checkbox" className="sr-only" checked={!!on} onChange={() => setEdit({ ...edit, cities: on ? edit.cities!.filter((x) => x !== c.code) : [...(edit.cities ?? []), c.code] })} />
                    {ar ? c.ar : c.en}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="ghost" onClick={() => setEdit(null)}>{a.cancel}</Button>
            <Button onClick={save} loading={busy}>{a.save}</Button>
          </div>
        </Card>
      ) : seasons === null ? (
        <div className="grid place-items-center py-12"><Spinner className="size-6 text-brand-600" /></div>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {seasons.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="admin-season">
                <span className="size-8 shrink-0 rounded-lg" style={{ background: s.color }} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{ar ? s.nameAr : s.nameEn} <span className="text-xs font-normal text-slate-500" dir="ltr">({s.id})</span></p>
                  <p className="text-xs text-slate-500">{fmtDay(s.startDate, locale)} – {fmtDay(s.endDate, locale)} · {s.cities.map(cityName).join(ar ? "، " : ", ")}</p>
                </div>
                <Badge tone={s.status === "published" ? "brand" : "amber"}>{a.status[s.status]}</Badge>
                <Button size="sm" variant="ghost" onClick={() => setEdit({ ...s })}>{a.edit}</Button>
                <Button size="sm" variant="ghost" className="text-red-700" onClick={() => remove(s)}>{a.delete}</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
