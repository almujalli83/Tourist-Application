"use client";

import { useEffect, useRef, useState } from "react";
import { fmt } from "@/i18n";
import { directionsLinks } from "@/lib/guide/geo";
import { destinationText, platformOf, RIDE_APP_NAMES, RIDE_APPS, rideLink, type Platform, type RideApp, type RideDestination, type RideEstimate } from "@/lib/transport/rides";
import { useApp } from "../app-provider";
import { CarIcon, DirectionsIcon } from "../icons";
import { cx } from "../ui";

/** Approximate fare range and time, labelled as an estimate. */
export function RideEstimateText({ e, className }: { e: RideEstimate; className?: string }) {
  const { t } = useApp();
  return <span className={className} data-testid="ride-estimate">{fmt(t.rides.estimate, { min: e.minSAR, max: e.maxSAR, mins: e.mins })}</span>;
}

/** «Order a car»: Uber (destination filled in), Careem and Jeeny (destination copied), and directions. */
export function RideMenu({ to, estimate, size = "sm", className }: { to: RideDestination; estimate?: RideEstimate | null; size?: "sm" | "md"; className?: string }) {
  const { t, locale } = useApp();
  const r = t.rides;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<RideApp | null>(null);
  const [platform, setPlatform] = useState<Platform>("other");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setPlatform(platformOf(navigator.userAgent)), []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  /** The link opens the app; for apps without a destination link the destination is copied too. */
  function go(app: RideApp) {
    if (rideLink(app, to, platform).direct) return;
    navigator.clipboard?.writeText(destinationText(to)).then(() => setCopied(app)).catch(() => undefined);
  }

  return (
    <div ref={ref} className={cx("relative inline-block", className)} data-testid="ride-menu">
      <button type="button" onClick={() => setOpen((x) => !x)} aria-expanded={open}
        className={cx("inline-flex items-center gap-1.5 rounded-lg bg-ink font-semibold text-white hover:bg-ink/90", size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm")} data-testid="ride-open">
        <CarIcon className="size-4" />{r.order}
      </button>
      {open && (
        <div className="absolute start-0 top-full z-30 mt-1.5 w-64 rounded-xl bg-white p-2 text-sm shadow-xl ring-1 ring-slate-200" role="menu">
          {estimate && <p className="px-2 pb-2 pt-1 text-xs text-slate-600"><RideEstimateText e={estimate} /></p>}
          {RIDE_APPS.map((app) => {
            const link = rideLink(app, to, platform);
            return (
              <a key={app} href={link.href} target="_blank" rel="noopener noreferrer" onClick={() => go(app)} role="menuitem" data-testid={`ride-${app}`}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 font-semibold hover:bg-slate-50">
                <span>{RIDE_APP_NAMES[app][locale === "ar" ? 0 : 1]}</span>
                <span className="text-[11px] font-normal text-slate-500">{copied === app ? r.copied : link.direct ? r.direct : r.copy}</span>
              </a>
            );
          })}
          <a href={directionsLinks(to).google} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1.5 rounded-lg border-t border-slate-100 px-2 pb-1 pt-2 text-xs font-semibold text-brand-700 hover:bg-slate-50">
            <DirectionsIcon className="size-3.5" />{r.directions}
          </a>
          <p className="px-2 pt-1 text-[11px] leading-4 text-slate-400">{r.note}</p>
        </div>
      )}
    </div>
  );
}
