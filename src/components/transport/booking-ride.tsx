"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { fmtDay } from "@/lib/events/format";
import { directionsLinks } from "@/lib/guide/geo";
import { RIDE_LEAD_MS, type RideTarget } from "@/lib/transport/booking-rides";
import { estimateRide } from "@/lib/transport/rides";
import { useApp } from "../app-provider";
import { CarIcon, DirectionsIcon } from "../icons";
import { RideEstimateText, RideMenu } from "./ride-menu";

/** The traveller's location when location access was already granted (never prompts). */
export function useKnownLocation(): { lat: number; lng: number } | null {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    let live = true;
    navigator.permissions?.query({ name: "geolocation" as PermissionName }).then((p) => {
      if (p.state !== "granted" || !live) return;
      navigator.geolocation.getCurrentPosition((g) => live && setPos({ lat: g.coords.latitude, lng: g.coords.longitude }), () => undefined, { maximumAge: 300_000, timeout: 10_000 });
    }).catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return pos;
}

/**
 * Getting to a booking's place (detail pages). Directions are there as soon as the booking is
 * confirmed; «order a car» from the day before until it ends (a ride comes right away, so earlier
 * it says when it opens).
 */
export function BookingRide({ rideAt, start }: { rideAt: (at: number) => RideTarget | null; start: number }) {
  const { t, locale } = useApp();
  const r = t.rides;
  const me = useKnownLocation();
  const now = Date.now();
  const target = rideAt(now);
  const ahead = !target && now < start ? rideAt(start) : null;
  const shown = target ?? ahead;
  if (!shown) return null;
  const from = shown.from ?? me;
  const e = from ? estimateRide(from, shown.to) : null;
  const directions = (
    <a href={directionsLinks(shown.to).google} target="_blank" rel="noopener noreferrer" data-testid="booking-directions"
      className={target ? "inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-white ring-1 ring-inset ring-white/30 hover:bg-white/10" : "inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-700 px-3 text-sm font-semibold text-white hover:bg-brand-800"}>
      <DirectionsIcon className="size-4" />{t.account.all.directions}
    </a>
  );
  if (!target) {
    const opens = fmtDay(new Date(start - RIDE_LEAD_MS + 3 * 3_600_000).toISOString().slice(0, 10), locale, { weekday: "long", day: "numeric", month: "long" });
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3" data-testid="booking-ride-ahead">
        <CarIcon className="size-5 shrink-0 text-brand-700" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{fmt(r.purpose[shown.purpose], { place: shown.to.name })}</p>
          <p className="text-xs text-slate-500" data-testid="ride-from">{fmt(t.account.all.rideFrom, { date: opens })}</p>
        </div>
        {directions}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white" data-testid="booking-ride">
      <CarIcon className="size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{fmt(r.purpose[target.purpose], { place: target.to.name })}</p>
        {e && <RideEstimateText e={e} className="text-xs text-slate-300" />}
      </div>
      {directions}
      <RideMenu to={target.to} from={from} estimate={e} size="md" light />
    </div>
  );
}
