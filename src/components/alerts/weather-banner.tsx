"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "../app-provider";
import { SunIcon, XIcon } from "../icons";
import { cx } from "../ui";

interface BannerAlert { id: string; severity: "warning" | "danger"; titleAr: string; titleEn: string; lineAr: string; lineEn: string; demo: boolean }

/** Today's weather alert during a trip, at the top of every page (can be dismissed). */
export function WeatherBanner() {
  const { t, locale, user } = useApp();
  const pathname = usePathname();
  const [alert, setAlert] = useState<BannerAlert | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (!user) return setAlert(null);
    fetch("/api/alerts/banner", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { alert: BannerAlert | null }) => {
        setAlert(d.alert);
        try {
          setHidden(!d.alert || sessionStorage.getItem("banner:dismissed") === d.alert.id);
        } catch {
          setHidden(!d.alert);
        }
      })
      .catch(() => undefined);
  }, [user, pathname]);

  if (!alert || hidden) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      sessionStorage.setItem("banner:dismissed", alert.id);
    } catch {
      /* private mode */
    }
  };
  return (
    <div role="alert" className={cx("text-sm", alert.severity === "danger" ? "bg-red-600 text-white" : "bg-amber-400 text-ink")} data-testid="weather-banner">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 sm:px-6">
        <SunIcon className="size-5 shrink-0" />
        <p className="min-w-0 flex-1">
          <b>{locale === "ar" ? alert.titleAr : alert.titleEn}</b>
          <span className="hidden sm:inline"> — {locale === "ar" ? alert.lineAr : alert.lineEn}</span>
          {alert.demo && <span className="ms-2 rounded bg-black/10 px-1.5 text-xs">{t.account.notifications.demo}</span>}
        </p>
        <Link href={`/${locale}/account/notifications`} className="shrink-0 font-semibold underline">{t.account.notifications.open}</Link>
        <button type="button" onClick={dismiss} aria-label={t.prayer.dismiss} className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-black/10"><XIcon className="size-4" /></button>
      </div>
    </div>
  );
}
