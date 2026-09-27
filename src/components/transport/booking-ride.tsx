"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import type { RideTarget } from "@/lib/transport/booking-rides";
import { estimateRide } from "@/lib/transport/rides";
import { useApp } from "../app-provider";
import { CarIcon } from "../icons";
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

/** «Order a car» to a booking's place (detail pages): destination, estimate and the ride menu. */
export function BookingRide({ target }: { target: RideTarget | null }) {
  const { t } = useApp();
  const r = t.rides;
  const me = useKnownLocation();
  if (!target) return null;
  const from = target.from ?? me;
  const e = from ? estimateRide(from, target.to) : null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white" data-testid="booking-ride">
      <CarIcon className="size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{fmt(r.purpose[target.purpose], { place: target.to.name })}</p>
        {e && <RideEstimateText e={e} className="text-xs text-slate-300" />}
      </div>
      <RideMenu to={target.to} estimate={e} size="md" light />
    </div>
  );
}
