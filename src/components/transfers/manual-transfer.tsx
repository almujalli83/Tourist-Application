"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AIRPORTS } from "@/lib/transport/rides";
import type { ManualInput } from "@/lib/transfers/transfers";
import type { Direction, PublicTransfer } from "@/lib/transfers/types";
import { useApp } from "../app-provider";
import { CarIcon } from "../icons";
import { Alert, Button, Card, cx, Field, Input, Select } from "../ui";
import { airportName, TransferRequest } from "./transfer-request";

/** For travellers without a package: flight and place by hand, then the vehicles and prices. */
export function ManualTransfer() {
  const { t, locale, user } = useApp();
  const s = t.transfers;
  const m = s.manual;
  const [dir, setDir] = useState<Direction>("arrival");
  const [f, setF] = useState({ airport: "RUH", flightNo: "", flightAt: "", placeName: "", placeLink: "", pax: 2, bags: 2 });
  const [source, setSource] = useState<{ manual: ManualInput } | null>(null);
  const [done, setDone] = useState<PublicTransfer | null>(null);
  // "Complete your trip" links arrive with the flight: ?transfer=arrival&airport=JED&flight=XY255&at=…&pax=2&place=…
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const d = p.get("transfer");
    if (d !== "arrival" && d !== "departure") return;
    setDir(d);
    const airport = p.get("airport") ?? "";
    const pax = Math.round(Number(p.get("pax")));
    const at = p.get("at") ?? "";
    setF((x) => ({
      ...x,
      ...(airport in AIRPORTS ? { airport } : {}),
      flightNo: (p.get("flight") ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase() || x.flightNo,
      ...(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at) ? { flightAt: at } : {}),
      ...(pax >= 1 && pax <= 8 ? { pax } : {}),
      placeName: (p.get("place") ?? "").slice(0, 120) || x.placeName,
    }));
  }, []);
  return (
    <Card id="transfer" className="scroll-mt-20 space-y-4 p-5" data-testid="manual-transfer">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold"><CarIcon className="size-5 text-brand-700" />{s.title}</h2>
        <p className="mt-1 text-sm text-slate-600">{s.intro}</p>
        <p className="mt-2 text-sm font-semibold text-slate-700">{m.title}</p>
      </div>
      {!user ? (
        <Link href={`/${locale}/login?next=/${locale}/transport`} className="text-sm font-semibold text-brand-700 underline">{m.signIn}</Link>
      ) : done ? (
        <Alert tone="success">
          <Link href={`/${locale}/account/transfers/${done.id}`} className="font-semibold underline" data-testid="manual-transfer-done">{s.direction[done.direction]} {done.reference} — {s.status[done.status]}</Link>
        </Alert>
      ) : source ? (
        <TransferRequest source={source} onDone={setDone} onCancel={() => setSource(null)} />
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setSource({ manual: { direction: dir, ...f } }); }}>
          <div className="flex gap-2">
            {(["arrival", "departure"] as const).map((d) => (
              <button key={d} type="button" aria-pressed={dir === d} onClick={() => setDir(d)}
                className={cx("h-9 rounded-full px-4 text-sm font-semibold", dir === d ? "bg-brand-800 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200")}>{s.direction[d]}</button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={m.airport}>
              <Select value={f.airport} onChange={(e) => setF({ ...f, airport: e.target.value })} data-testid="manual-airport">
                {Object.keys(AIRPORTS).map((a) => <option key={a} value={a}>{airportName(a, locale)}</option>)}
              </Select>
            </Field>
            <Field label={m.flightNo} required><Input value={f.flightNo} onChange={(e) => setF({ ...f, flightNo: e.target.value })} dir="ltr" placeholder="SV1234" required data-testid="manual-flight" /></Field>
            <Field label={m.flightAt} required><Input type="datetime-local" value={f.flightAt} onChange={(e) => setF({ ...f, flightAt: e.target.value })} required data-testid="manual-when" /></Field>
            <Field label={m.place} required><Input value={f.placeName} onChange={(e) => setF({ ...f, placeName: e.target.value })} dir="auto" required data-testid="manual-place" /></Field>
            <Field label={m.placeLink}><Input value={f.placeLink} onChange={(e) => setF({ ...f, placeLink: e.target.value })} dir="ltr" placeholder="https://maps.google.com/…" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={m.pax}><Input type="number" min={1} max={10} value={f.pax} onChange={(e) => setF({ ...f, pax: Number(e.target.value) })} /></Field>
              <Field label={m.bags}><Input type="number" min={0} max={15} value={f.bags} onChange={(e) => setF({ ...f, bags: Number(e.target.value) })} /></Field>
            </div>
          </div>
          <Button type="submit" data-testid="manual-next">{m.next}</Button>
        </form>
      )}
    </Card>
  );
}
