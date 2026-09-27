"use client";

import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { formatIn } from "@/lib/currency";
import { countryName } from "@/lib/data/countries";
import { cityName } from "@/lib/data/cities";
import { CITY_CENTERS } from "@/lib/guide/centers";
import type { Count, Indicators } from "@/lib/indicators/indicators";
import { useApp } from "./app-provider";
import { Alert, Button, Card, Field, Input, Select, Spinner } from "./ui";

const monthOf = (d: Date) => d.toISOString().slice(0, 7);

function Bars({ rows, label, testId }: { rows: { key: string; value: Count }[]; label: (k: string) => string; testId?: string }) {
  const { t } = useApp();
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0));
  return (
    <ul className="space-y-1.5" data-testid={testId}>
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,8rem)_1fr_3.5rem] items-center gap-2 text-sm">
          <span className="truncate text-slate-700">{label(r.key)}</span>
          <span className="h-3 overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full rounded-full bg-brand-600" style={{ width: `${((r.value ?? 0) / max) * 100}%` }} />
          </span>
          <span className="text-end tabular-nums text-slate-600">{r.value === null ? <span title={fmt(t.indicators.hidden, { n: 5 })}>{"<5"}</span> : r.value.toLocaleString("en")}</span>
        </li>
      ))}
    </ul>
  );
}

/** Tourism indicators for the Ministry (aggregated and anonymous). */
export function IndicatorsView() {
  const { t, locale } = useApp();
  const s = t.indicators;
  const now = new Date();
  const [q, setQ] = useState({ from: monthOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1))), to: monthOf(now), city: "" });
  const [data, setData] = useState<Indicators | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const qs = `from=${q.from}&to=${q.to}${q.city ? `&city=${q.city}` : ""}`;
  const load = useCallback((query: string) => {
    setState("loading");
    fetch(`/api/indicators?${query}`, { cache: "no-store" }).then(async (r) => {
      if (!r.ok) return setState("error");
      setData(await r.json());
      setState("ok");
    }).catch(() => setState("error"));
  }, []);
  useEffect(() => {
    load(qs);
    // Loaded once with the default period; later on "Show".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const money = (v: number) => formatIn(v, "SAR", locale);
  const num = (v: number) => v.toLocaleString("en");
  const d = data;
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6" data-testid="indicators">
      <div>
        <h1 className="text-2xl font-bold text-ink">{s.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{fmt(s.intro, { n: 5 })}</p>
      </div>
      <Card className="flex flex-wrap items-end gap-3 p-4 print:hidden">
        <Field label={s.from}><Input type="month" value={q.from} onChange={(e) => setQ({ ...q, from: e.target.value })} dir="ltr" data-testid="ind-from" /></Field>
        <Field label={s.to}><Input type="month" value={q.to} onChange={(e) => setQ({ ...q, to: e.target.value })} dir="ltr" data-testid="ind-to" /></Field>
        <Field label={s.city}>
          <Select value={q.city} onChange={(e) => setQ({ ...q, city: e.target.value })} data-testid="ind-city">
            <option value="">{s.allCities}</option>
            {Object.keys(CITY_CENTERS).map((c) => <option key={c} value={c}>{cityName(c, locale)}</option>)}
          </Select>
        </Field>
        <Button onClick={() => load(qs)} data-testid="ind-apply">{s.apply}</Button>
        <a href={`/api/indicators?${qs}&format=csv`} download className="inline-flex h-11 items-center rounded-lg bg-white px-4 text-sm font-semibold text-brand-800 ring-1 ring-inset ring-brand-700/25 hover:bg-brand-50" data-testid="ind-csv">{s.csv}</a>
        <Button variant="secondary" onClick={() => window.print()}>{s.print}</Button>
      </Card>
      {state === "error" && <Alert tone="error">{s.invalid}</Alert>}
      {state === "loading" && !d && <div className="grid h-40 place-items-center text-brand-700"><Spinner className="size-6" /></div>}
      {d && (
        <>
          {d.sandbox && <Alert tone="warning">{s.sandbox}</Alert>}
          <p className="text-xs text-slate-500">{fmt(s.generated, { date: new Date(d.generatedAt).toLocaleString(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB") })}</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6" data-testid="ind-kpis">
            {([
              [s.kpi.travellers, num(d.visitors.travellers)], [s.kpi.bookings, num(d.visitors.bookings)], [s.kpi.visas, num(d.visitors.visasIssued)],
              [s.kpi.stay, d.visitors.avgStayNights], [s.kpi.lead, d.visitors.avgLeadDays], [s.kpi.group, d.visitors.avgGroupSize],
              [s.kpi.spend, money(d.spending.packagesSAR)], [s.kpi.perTraveller, money(d.spending.perTravellerSAR)], [s.kpi.company, `${d.visitors.companyShare}%`],
              [s.kpi.next30, num(d.upcoming.next30)], [s.kpi.next90, num(d.upcoming.next90)], [s.satisfaction, d.satisfaction.avg ?? "—"],
            ] as [string, string | number][]).map(([label, value]) => (
              <Card key={label} className="p-4">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-brand-800" dir="ltr">{value}</p>
              </Card>
            ))}
          </div>

          <Card className="p-5">
            <h2 className="mb-4 font-bold text-ink">{s.byMonth}</h2>
            <div className="flex h-44 items-end gap-1.5" data-testid="ind-months" dir="ltr">
              {d.byMonth.map((m) => {
                const max = Math.max(1, ...d.byMonth.map((x) => x.travellers));
                return (
                  <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${m.month}: ${m.travellers}`}>
                    <span className="text-[10px] tabular-nums text-slate-500">{m.travellers || ""}</span>
                    <span className="w-full rounded-t bg-brand-600" style={{ height: `${(m.travellers / max) * 120}px` }} />
                    <span className="text-[10px] text-slate-500">{m.month.slice(2)}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-3 font-bold text-ink">{s.byNationality}</h2>
              {d.byNationality.length ? <Bars testId="ind-nat" rows={d.byNationality.map((r) => ({ key: r.code, value: r.travellers }))} label={(k) => countryName(k, locale) || k} /> : <p className="text-sm text-slate-500">{s.none}</p>}
            </Card>
            <Card className="p-5">
              <h2 className="mb-3 font-bold text-ink">{s.byCity} — {s.nights}</h2>
              {d.byCity.length ? <Bars testId="ind-cities" rows={d.byCity.map((r) => ({ key: r.city, value: r.nights }))} label={(k) => cityName(k, locale)} /> : <p className="text-sm text-slate-500">{s.none}</p>}
            </Card>
            <Card className="p-5">
              <h2 className="mb-3 font-bold text-ink">{s.byOrigin}</h2>
              {d.byOrigin.length ? <Bars rows={d.byOrigin.map((r) => ({ key: r.code, value: r.bookings }))} label={(k) => cityName(k, locale)} /> : <p className="text-sm text-slate-500">{s.none}</p>}
            </Card>
            <Card className="p-5">
              <h2 className="mb-3 font-bold text-ink">{s.hotelStars}</h2>
              <Bars rows={d.hotelStars.map((r) => ({ key: String(r.stars), value: r.stays }))} label={(k) => fmt(s.stars, { n: k })} />
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="overflow-x-auto p-5">
              <h2 className="mb-3 font-bold text-ink">{s.services}</h2>
              <table className="w-full text-sm" data-testid="ind-services">
                <thead><tr className="text-start text-xs text-slate-500"><th className="py-1 text-start font-semibold">{s.service}</th><th className="text-end font-semibold">{s.orders}</th><th className="text-end font-semibold">{s.amount}</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {d.spending.services.map((r) => (
                    <tr key={r.service}><td className="py-1.5">{(s.serviceNames as Record<string, string>)[r.service] ?? r.service}</td><td className="text-end tabular-nums">{num(r.orders)}</td><td className="text-end tabular-nums">{r.amountSAR ? money(r.amountSAR) : "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card className="space-y-4 p-5">
              <h2 className="font-bold text-ink">{s.satisfaction}</h2>
              <div className="flex flex-wrap gap-6 text-sm">
                <span>{s.reviews}: <b className="tabular-nums">{num(d.satisfaction.reviews)}</b></span>
                <span>{s.avg}: <b className="tabular-nums">{d.satisfaction.avg ?? "—"}</b></span>
                <span>{s.complaints}: <b className="tabular-nums">{num(d.satisfaction.complaints)}</b></span>
              </div>
              <ul className="divide-y divide-slate-100 text-sm">
                {d.satisfaction.byTarget.map((r) => (
                  <li key={r.target} className="flex justify-between py-1.5"><span>{(s.targets as Record<string, string>)[r.target] ?? r.target}</span><span className="tabular-nums text-slate-600">{r.avg ?? "—"} · {r.reviews ?? `<5`}</span></li>
                ))}
              </ul>
              <h3 className="border-t border-slate-100 pt-3 font-bold text-ink">{s.accounts}</h3>
              <div className="flex flex-wrap gap-6 text-sm">
                <span>{s.individual}: <b className="tabular-nums">{num(d.accounts.individual)}</b></span>
                <span>{s.companies}: <b className="tabular-nums">{num(d.accounts.company)}</b></span>
                <span>{s.families}: <b className="tabular-nums">{num(d.accounts.families)}</b></span>
              </div>
            </Card>
          </div>
          <p className="text-xs text-slate-500">{s.api}</p>
        </>
      )}
    </div>
  );
}
