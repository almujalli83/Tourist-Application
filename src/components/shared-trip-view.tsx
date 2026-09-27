"use client";

import { fmt } from "@/i18n";
import { cityName } from "@/lib/data/cities";
import { fmtDay } from "@/lib/events/format";
import type { SharedTrip } from "@/lib/family/share";
import { directionsLinks } from "@/lib/guide/geo";
import { useApp } from "./app-provider";
import { CalendarIcon, HotelIcon, MapPinIcon, PlaneIcon, TicketIcon } from "./icons";
import { Alert, Card } from "./ui";

/** A trip shared by link (view only). */
export function SharedTripView({ trip }: { trip: SharedTrip | null }) {
  const { t, locale } = useApp();
  const s = t.tripShare;
  const ar = locale === "ar";
  const day = (d: string) => fmtDay(d, locale, { weekday: "short", day: "numeric", month: "long" });
  if (!trip) return <div className="mx-auto max-w-2xl px-4 py-10"><Alert tone="error">{s.notFound}</Alert></div>;
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8" data-testid="shared-trip">
      <div>
        <h1 className="text-2xl font-bold text-ink">{s.pageTitle}</h1>
        <p className="mt-1 text-sm text-slate-600">{s.pageIntro}</p>
      </div>
      <Card className="p-5">
        <p className="text-lg font-bold text-ink">{trip.cities.map((c) => cityName(c, locale)).join(locale === "ar" ? " ← " : " → ")}</p>
        <p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><CalendarIcon className="size-4" />{fmt(s.dates, { from: day(trip.departureDate), to: day(trip.returnDate) })} · {fmt(s.travellers, { n: trip.travellers })}</p>
      </Card>
      {trip.flights.length > 0 && (
        <Card className="space-y-2 p-5">
          <h2 className="flex items-center gap-2 font-bold"><PlaneIcon className="size-5 text-brand-700" />{s.flights}</h2>
          {trip.flights.map((f) => (
            <p key={f.flightNo + f.departAt} className="text-sm text-slate-700" dir="auto">
              <span className="font-semibold">{ar ? f.carrierNameAr : f.carrierNameEn} {f.flightNo}</span> · {f.from} → {f.to} · {f.departAt.replace("T", " ")} → {f.arriveAt.slice(11)}
            </p>
          ))}
        </Card>
      )}
      {trip.hotels.length > 0 && (
        <Card className="space-y-3 p-5">
          <h2 className="flex items-center gap-2 font-bold"><HotelIcon className="size-5 text-brand-700" />{s.hotels}</h2>
          {trip.hotels.map((h) => (
            <div key={h.nameEn + h.checkIn} className="text-sm">
              <p className="font-semibold text-ink">{ar ? h.nameAr : h.nameEn} · {cityName(h.city, locale)}</p>
              <p className="text-slate-600">{ar ? h.districtAr : h.districtEn} · {fmt(s.checkIn, { date: day(h.checkIn) })} · {fmt(s.checkOut, { date: day(h.checkOut) })}</p>
              {h.lat !== undefined && h.lng !== undefined && (
                <a href={directionsLinks({ lat: h.lat, lng: h.lng }).google} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"><MapPinIcon className="size-3.5" />{s.map}</a>
              )}
            </div>
          ))}
        </Card>
      )}
      {trip.activities.length > 0 && (
        <Card className="space-y-2 p-5">
          <h2 className="flex items-center gap-2 font-bold"><TicketIcon className="size-5 text-brand-700" />{s.activities}</h2>
          {trip.activities.map((a) => (
            <p key={a.titleEn + a.date} className="text-sm text-slate-700">
              <span className="font-semibold">{ar ? a.titleAr : a.titleEn}</span> · {ar ? a.venueAr : a.venueEn} · {day(a.date)} {a.timeFrom}–{a.timeTo}
            </p>
          ))}
        </Card>
      )}
    </div>
  );
}
