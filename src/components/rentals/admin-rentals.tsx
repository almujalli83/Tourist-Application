"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import type { LicenceRule, LicenceRules } from "@/lib/rentals/licence";
import { useApp } from "../app-provider";
import { Alert, Button, Card, Field, Input, Spinner, Textarea } from "../ui";
import { AdminCompanies } from "./admin-companies";

type Draft = { id: string; countries: string; titleAr: string; titleEn: string; reqAr: string; reqEn: string };
const toDraft = (r: LicenceRule): Draft => ({ id: r.id, countries: r.countries.join(", "), titleAr: r.titleAr, titleEn: r.titleEn, reqAr: r.requirementsAr.join("\n"), reqEn: r.requirementsEn.join("\n") });
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

/** Operations: the driving-licence requirements shown to travellers who rent a car. */
export function AdminRentals() {
  const { t, locale } = useApp();
  const a = t.rentals.admin;
  const [data, setData] = useState<LicenceRules | null>(null);
  const [rules, setRules] = useState<Draft[]>([]);
  const [source, setSource] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  useEffect(() => {
    fetch("/api/admin/rentals", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      setData(d.licence);
      setRules(d.licence.rules.map(toDraft));
      setSource(d.licence.sourceUrl);
      setReviewed(!!d.licence.reviewedAt);
    });
  }, []);
  if (!data) return <div className="grid h-40 place-items-center text-brand-700"><Spinner className="size-6" /></div>;
  const upd = (i: number, k: keyof Draft, v: string) => setRules(rules.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/rentals", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceUrl: source, reviewed,
        rules: rules.map((r) => ({ id: r.id, countries: r.countries.split(","), titleAr: r.titleAr, titleEn: r.titleEn, requirementsAr: lines(r.reqAr), requirementsEn: lines(r.reqEn) })),
      }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ tone: "error", text: a.invalid });
    setData(d.licence);
    setMsg({ tone: "success", text: a.saved });
  }
  return (
    <div className="space-y-5" data-testid="admin-rentals">
      <h1 className="text-2xl font-bold">{a.nav}</h1>
      <AdminCompanies />
      <hr className="border-slate-200" />
      <div>
        <h2 className="text-xl font-bold">{a.title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{a.intro}</p>
        <p className="mt-2 text-sm font-semibold" data-testid="admin-rentals-reviewed">
          {data.reviewedAt ? fmt(a.reviewedAt, { date: new Date(data.reviewedAt).toLocaleDateString(locale), by: data.reviewedBy ?? "" }) : <span className="text-amber-700">{a.notReviewed}</span>}
        </p>
      </div>
      {rules.map((r, i) => (
        <Card key={i} className="grid gap-3 p-5 md:grid-cols-2" data-testid="admin-rule">
          <Field label={a.countries} className="md:col-span-2"><Input value={r.countries} onChange={(e) => upd(i, "countries", e.target.value)} dir="ltr" /></Field>
          <Field label={a.titleAr}><Input value={r.titleAr} onChange={(e) => upd(i, "titleAr", e.target.value)} dir="rtl" /></Field>
          <Field label={a.titleEn}><Input value={r.titleEn} onChange={(e) => upd(i, "titleEn", e.target.value)} dir="ltr" /></Field>
          <Field label={a.reqAr}><Textarea rows={5} value={r.reqAr} onChange={(e) => upd(i, "reqAr", e.target.value)} dir="rtl" /></Field>
          <Field label={a.reqEn}><Textarea rows={5} value={r.reqEn} onChange={(e) => upd(i, "reqEn", e.target.value)} dir="ltr" /></Field>
          {rules.length > 1 && <div className="md:col-span-2"><Button size="sm" variant="ghost" onClick={() => setRules(rules.filter((_, j) => j !== i))}>{a.remove}</Button></div>}
        </Card>
      ))}
      <Button variant="secondary" onClick={() => setRules([...rules, { id: `rule-${rules.length + 1}`, countries: "", titleAr: "", titleEn: "", reqAr: "", reqEn: "" }])}>{a.addRule}</Button>
      <Card className="space-y-3 p-5">
        <Field label={a.source}><Input value={source} onChange={(e) => setSource(e.target.value)} dir="ltr" /></Field>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="accent-brand-700" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} data-testid="admin-rentals-review" />{a.reviewed}
        </label>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button loading={busy} onClick={save} data-testid="admin-rentals-save">{a.save}</Button>
      </Card>
    </div>
  );
}
