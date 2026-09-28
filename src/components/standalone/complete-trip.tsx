"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { fmt } from "@/i18n";
import { cityName } from "@/lib/data/cities";
import { fmtDay } from "@/lib/events/format";
import type { Step, StepKey } from "@/lib/standalone/next-steps";
import { useApp } from "../app-provider";
import { CarIcon, GlobeIcon, HotelIcon, KaabaIcon, MapPinIcon, PlaneIcon, SunIcon, TicketIcon, UsersIcon } from "../icons";
import { Card } from "../ui";

const ICONS: Record<StepKey, ComponentType<{ className?: string }>> = {
  hotel: HotelIcon, flight: PlaneIcon, transfer: CarIcon, rental: CarIcon, esim: GlobeIcon, events: TicketIcon,
  restaurants: MapPinIcon, guides: UsersIcon, prayer: KaabaIcon,
};

/**
 * "Complete your trip": the next services for a flight or hotel booking, each opening its page
 * already filled with the city, dates and flight. `have` lists what is already booked here.
 */
export function CompleteTrip({ steps, city, from, to, have, testId }: {
  steps: Step[];
  city?: string;
  from?: string;
  to?: string;
  have?: { label: string; href: string }[];
  testId?: string;
}) {
  const { t, locale } = useApp();
  const n = t.standalone.next;
  if (!steps.length && !have?.length) return null;
  const day = (d: string) => fmtDay(d, locale, { day: "numeric", month: "short" });
  const when = (at: string) => `${day(at.slice(0, 10))} ${at.slice(11, 16)}`;
  const place = city ? cityName(city, locale) : "";
  const label = (s: Step) => {
    if (s.key === "transfer" && s.leg) return fmt(s.leg.direction === "arrival" ? n.transferArrival : n.transferDeparture, { airport: cityName(s.leg.airport, locale), time: when(s.leg.at), flight: s.leg.flightNo });
    if (s.key === "transfer") return fmt(n.transferCity, { city: place });
    if (s.key === "hotel") return fmt(n.hotel, { city: place, from: from ? day(from) : "", to: to ? day(to) : "" });
    return fmt(n[s.key as Exclude<StepKey, "transfer" | "hotel">], { city: place });
  };
  return (
    <Card className="space-y-3 p-5 print:hidden" data-testid={testId ?? "complete-trip"}>
      <div>
        <h2 className="flex items-center gap-2 font-bold"><SunIcon className="size-5 text-gold-600" />{n.title}</h2>
        <p className="mt-1 text-xs text-slate-600">{n.note}</p>
      </div>
      {have && have.length > 0 && (
        <ul className="space-y-1 text-sm">
          {have.map((h) => (
            <li key={h.href}><Link href={`/${locale}${h.href}`} className="font-semibold text-brand-800 underline" data-testid="complete-trip-have">{h.label}</Link></li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {steps.map((s, i) => {
          const Icon = ICONS[s.key];
          return (
            <Link key={`${s.key}-${i}`} href={`/${locale}${s.href}`} data-testid={`next-${s.key}`}
              className="flex min-h-11 items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-brand-800 ring-1 ring-inset ring-brand-700/25 hover:bg-brand-50">
              <Icon className="size-4 shrink-0 text-brand-700" />
              <span>{label(s)}</span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
