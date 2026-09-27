"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { cityName } from "@/lib/data/cities";
import type { PublicRental, RentalQuery, RentalStatus } from "@/lib/rentals/types";
import { localWhen } from "../transfers/transfer-request";
import { useApp } from "../app-provider";
import { CarIcon } from "../icons";
import { Alert, Badge, Button, Card, Spinner } from "../ui";
import { DrivingTips, RentalSearch } from "./rental-search";

export const RENTAL_TONE: Record<RentalStatus, "amber" | "brand" | "red" | "slate"> = { requested: "amber", confirmed: "brand", rejected: "red", cancelled: "red", completed: "slate" };

/** Car rental on the transport page: search and book, with the driving tips. */
export function RentalPanel({ city }: { city: string }) {
  const { t, locale } = useApp();
  const r = t.rentals;
  const [done, setDone] = useState<PublicRental | null>(null);
  const [key, setKey] = useState(0);
  return (
    <section id="rental" className="grid gap-4 lg:grid-cols-3" data-testid="rental-panel">
      <Card className="space-y-4 p-5 lg:col-span-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold"><CarIcon className="size-5 text-brand-700" />{r.title}</h2>
          <p className="mt-1 text-sm text-slate-600">{r.intro}</p>
        </div>
        {done ? (
          <Alert tone="success">
            <span data-testid="rental-done">{r.status[done.status]} · {done.reference} — </span>
            <Link href={`/${locale}/account/rentals/${done.id}`} className="font-semibold underline">{r.view}</Link>
            <button type="button" className="ms-3 text-xs underline" onClick={() => { setDone(null); setKey(key + 1); }}>{r.search}</button>
          </Alert>
        ) : (
          <RentalSearch key={`${city}-${key}`} initial={{ city, dropoffCity: city }} onDone={setDone} />
        )}
      </Card>
      <DrivingTips />
    </section>
  );
}

/** A package's car rentals: those booked, and one suggestion per city stay. */
export function RentalsSection({ bookingId, cancelled }: { bookingId: string; cancelled: boolean }) {
  const { t, locale, money } = useApp();
  const r = t.rentals;
  const [list, setList] = useState<PublicRental[] | null>(null);
  const [plans, setPlans] = useState<{ plans: RentalQuery[]; driverName: string } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const load = useCallback(() => {
    fetch("/api/rentals", { cache: "no-store" }).then((x) => (x.ok ? x.json() : { rentals: [] })).then((d) => setList((d.rentals as PublicRental[]).filter((x) => x.bookingId === bookingId))).catch(() => setList([]));
  }, [bookingId]);
  useEffect(load, [load]);
  useEffect(() => {
    fetch(`/api/rentals/plans?bookingId=${bookingId}`).then((x) => (x.ok ? x.json() : null)).then(setPlans).catch(() => setPlans(null));
  }, [bookingId]);
  if (cancelled) return null;
  const active = (list ?? []).filter((x) => x.status === "requested" || x.status === "confirmed");
  return (
    <Card className="space-y-4 p-5" id="rentals" data-testid="rentals-section">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold"><CarIcon className="size-5 text-brand-700" />{r.section}</h2>
        <p className="mt-1 text-sm text-slate-600">{r.sectionIntro}</p>
      </div>
      {!list || !plans ? (
        <div className="grid h-16 place-items-center text-brand-700"><Spinner className="size-5" /></div>
      ) : (
        <>
          {list.map((x) => (
            <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-4" data-testid="rental-row">
              <div className="text-sm">
                <p className="font-semibold">{r.classes[x.carClass]} · {locale === "ar" ? x.providerNameAr : x.providerNameEn}</p>
                <p className="text-slate-600">{localWhen(x.pickupAt, locale)} ← {localWhen(x.returnAt, locale)} · <span className="ltr-nums">{money(x.totalSAR)}</span></p>
              </div>
              <span className="flex items-center gap-2">
                <Badge tone={RENTAL_TONE[x.status]}>{r.status[x.status]}</Badge>
                <Link href={`/${locale}/account/rentals/${x.id}`} className="text-sm font-semibold text-brand-700 hover:underline">{r.view}</Link>
              </span>
            </div>
          ))}
          {plans.plans.map((p, i) => {
            const covered = active.some((x) => x.city === p.city && x.pickupAt < p.returnAt && x.returnAt > p.pickupAt);
            if (covered) return null;
            return (
              <div key={i} className="rounded-xl border border-dashed border-slate-300 p-4" data-testid="rental-stay">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{fmt(r.forStay, { city: cityName(p.city, locale), from: localWhen(p.pickupAt, locale), to: localWhen(p.returnAt, locale) })}</p>
                  {open !== i && <Button size="sm" onClick={() => setOpen(i)} data-testid="rental-open">{r.advisedCta}</Button>}
                </div>
                {open === i && (
                  <div className="mt-3">
                    <RentalSearch initial={p} bookingId={bookingId} driverName={plans.driverName} compact onCancel={() => setOpen(null)} onDone={() => { setOpen(null); load(); }} />
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </Card>
  );
}
