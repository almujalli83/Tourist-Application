"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { isFriday, ksaNow, nextPrayer } from "@/lib/prayer/times";
import { useApp } from "../app-provider";
import { ClockIcon, XIcon } from "../icons";
import { readSettings } from "./settings";

/** Fired by «Test the alert» on the prayer times page. */
export const TEST_ALERT = "prayer:test-alert";
const ALERTED = "prayer:alerted";

/**
 * Alerts before each prayer for travellers who turned it on (off by default): a banner in the app
 * and a browser notification when allowed. Runs while the site is open.
 */
export function PrayerAlerts() {
  const { t, locale } = useApp();
  const p = t.prayer;
  const [alert, setAlert] = useState<{ title: string; body: string } | null>(null);

  useEffect(() => {
    const build = (force: boolean) => {
      const s = readSettings();
      const loc = s.loc ?? { lat: 24.7136, lng: 46.6753, city: "RUH" };
      if (!force && (!s.alertMins || !s.loc)) return null;
      const { day, min } = ksaNow(new Date());
      const n = nextPrayer(day, min, loc.lat, loc.lng);
      const name = n.name === "dhuhr" && isFriday(n.day) ? p.names.jumuah : p.names[n.name];
      if (!force) {
        if (n.inMin > s.alertMins) return null;
        const key = `${n.day}:${n.name}`;
        try {
          if (localStorage.getItem(ALERTED) === key) return null;
          localStorage.setItem(ALERTED, key);
        } catch {
          return null;
        }
      }
      return { title: fmt(p.alertTitle, { name }), body: fmt(p.alertBody, { name, time: n.time, m: n.inMin }) };
    };
    const show = (force: boolean) => {
      const a = build(force);
      if (!a) return;
      setAlert(a);
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(a.title, { body: a.body, icon: "/icon.svg", tag: "prayer" });
      } catch {
        /* notifications unavailable (e.g. some mobile browsers need a service worker) */
      }
    };
    show(false);
    const id = setInterval(() => show(false), 30_000);
    const test = () => show(true);
    window.addEventListener(TEST_ALERT, test);
    return () => {
      clearInterval(id);
      window.removeEventListener(TEST_ALERT, test);
    };
  }, [p]);

  if (!alert) return null;
  return (
    <div role="status" className="fixed inset-x-3 bottom-[calc(6rem+var(--bottom-bar,0px))] z-50 mx-auto max-w-md rounded-2xl bg-brand-900 p-4 text-white shadow-2xl ring-1 ring-white/10 sm:bottom-[calc(1.5rem+var(--bottom-bar,0px))]" data-testid="prayer-alert">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold-500/20 text-gold-100"><ClockIcon className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{alert.title}</p>
          <p className="mt-0.5 text-sm text-brand-100">{alert.body}</p>
          <Link href={`/${locale}/prayer`} onClick={() => setAlert(null)} className="mt-2 inline-block text-xs font-semibold text-gold-100 underline">{p.open}</Link>
        </div>
        <button type="button" onClick={() => setAlert(null)} aria-label={p.dismiss} className="grid size-8 place-items-center rounded-full hover:bg-white/10"><XIcon className="size-4" /></button>
      </div>
    </div>
  );
}
