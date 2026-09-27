"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { KAABA } from "@/lib/prayer/times";
import type { Journey } from "@/lib/transit/types";
import { useApp } from "../app-provider";
import { BusIcon, TicketIcon } from "../icons";
import { useTransitOperators } from "./use-transit";

/** On the Umrah trip: the next bus from the hotel in Makkah to Masjid al-Haram, and its ticket. */
export function UmrahBus({ hotel }: { hotel: { name: string; lat: number; lng: number } | null | undefined }) {
  const { t, locale } = useApp();
  const x = t.transit;
  const ar = locale === "ar";
  const on = !!useTransitOperators()?.some((o) => o.city === "MKX");
  const [j, setJ] = useState<Journey | null>(null);
  useEffect(() => {
    if (!on || !hotel) return;
    fetch("/api/transit/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ city: "MKX", from: hotel, to: { name: "Masjid al-Haram", nameAr: "المسجد الحرام", ...KAABA } }) })
      .then((r) => (r.ok ? r.json() : null)).then((d) => setJ((d?.journeys as Journey[] | undefined)?.find((q) => q.legs.some((l) => l.mode === "bus")) ?? null)).catch(() => undefined);
  }, [on, hotel]);
  if (!on) return null;
  const ride = j?.legs.find((l) => l.mode === "bus");
  return (
    <div className="space-y-2 rounded-xl bg-slate-50 p-3" data-testid="umrah-bus">
      <p className="flex items-center gap-2 text-sm font-bold"><BusIcon className="size-4 text-brand-700" />{x.umrahBus}</p>
      {ride && (
        <p className="text-xs text-slate-700" data-testid="umrah-bus-next">
          <span className="me-1 inline-block rounded px-1.5 py-0.5 font-bold text-white" style={{ background: ride.color ?? "#334155" }}>{ride.line}</span>
          {fmt(x.board, { stop: ar ? ride.from.nameAr ?? ride.from.name : ride.from.name, time: ride.departAt.slice(11, 16) })} · {fmt(x.journey, { mins: j!.mins, changes: j!.changes ? x.changes : x.direct })}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Link href={`/${locale}/transport?city=MKX`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-brand-800 ring-1 ring-brand-700/15 hover:bg-brand-50" data-testid="umrah-bus-buy">
          <TicketIcon className="size-4" />{x.umrahBuy}
        </Link>
      </div>
    </div>
  );
}
