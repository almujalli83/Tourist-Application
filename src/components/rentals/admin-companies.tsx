"use client";

import { useEffect, useState } from "react";
import type { RentalCompany } from "@/lib/rentals/companies";
import { useApp } from "../app-provider";
import { Alert, Button, Card, Field, Input, Spinner } from "../ui";
import { CompanyBadge } from "./company-badge";

type Draft = Omit<RentalCompany, "cities" | "logoVersion"> & { cities: string };
const MAX = 150_000;

/** Operations: rental companies shown to travellers — names, colour, logo, cities, shown or not. */
export function AdminCompanies() {
  const { t } = useApp();
  const a = t.rentals.admin;
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const load = (list: RentalCompany[]) => setRows(list.map((c) => ({ ...c, cities: c.cities.join(", ") })));
  useEffect(() => {
    fetch("/api/admin/rentals/companies", { cache: "no-store" }).then((r) => r.json()).then((d) => load(d.companies));
  }, []);
  if (!rows) return <div className="grid h-24 place-items-center text-brand-700"><Spinner className="size-6" /></div>;
  const upd = (i: number, patch: Partial<Draft>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  function pickLogo(i: number, f: File | undefined) {
    if (!f) return;
    if (f.size > MAX || !/^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type)) return setMsg({ tone: "error", text: a.logoTooBig });
    const reader = new FileReader();
    reader.onload = () => upd(i, { logo: String(reader.result) });
    reader.readAsDataURL(f);
  }
  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/rentals/companies", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ companies: rows!.map((r) => ({ ...r, cities: r.cities.split(",") })) }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ tone: "error", text: d.error === "invalidLogo" ? a.logoTooBig : a.companiesInvalid });
    load(d.companies);
    setMsg({ tone: "success", text: a.saved });
  }
  return (
    <section className="space-y-4" data-testid="admin-companies">
      <div>
        <h2 className="text-xl font-bold">{a.companiesTitle}</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{a.companiesIntro}</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((r, i) => (
          <Card key={i} className="space-y-3 p-4" data-testid="admin-company">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CompanyBadge brand={{ id: r.id, nameAr: r.nameAr, nameEn: r.nameEn, color: r.color, logo: r.logo }} />
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" className="accent-brand-700" checked={r.active} onChange={(e) => upd(i, { active: e.target.checked })} />{a.active}
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={a.companyId}><Input value={r.id} onChange={(e) => upd(i, { id: e.target.value })} dir="ltr" /></Field>
              <Field label={a.nameAr}><Input value={r.nameAr} onChange={(e) => upd(i, { nameAr: e.target.value })} dir="rtl" /></Field>
              <Field label={a.nameEn}><Input value={r.nameEn} onChange={(e) => upd(i, { nameEn: e.target.value })} dir="ltr" /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
              <Field label={a.color}><input type="color" value={r.color} onChange={(e) => upd(i, { color: e.target.value })} className="h-10 w-full cursor-pointer rounded-lg border border-slate-300" /></Field>
              <Field label={a.cities}><Input value={r.cities} onChange={(e) => upd(i, { cities: e.target.value })} dir="ltr" /></Field>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{a.logo}:</span>
              <label className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-white px-3 text-xs font-semibold text-brand-800 ring-1 ring-brand-700/25 hover:bg-brand-50">
                {a.uploadLogo}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => pickLogo(i, e.target.files?.[0])} data-testid="admin-company-logo" />
              </label>
              {r.logo && <button type="button" className="text-xs font-semibold text-red-700 hover:underline" onClick={() => upd(i, { logo: null })}>{a.removeLogo}</button>}
              <span className="text-xs text-slate-500">{a.logoHint}</span>
            </div>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setRows([...rows, { id: "", nameAr: "", nameEn: "", color: "#334155", cities: "RUH, JED", active: true, logo: null }])}>{a.addCompany}</Button>
        <Button loading={busy} onClick={save} data-testid="admin-companies-save">{a.saveCompanies}</Button>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </section>
  );
}
