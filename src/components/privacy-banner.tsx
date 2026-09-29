"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { needsPrivacyAck, PRIVACY_VERSION } from "@/lib/compliance/privacy-version";
import { fmt } from "@/i18n";
import { useApp } from "./app-provider";

/**
 * Asks signed-in users to read the privacy policy when its version changed since they last did.
 * A bar fixed to the bottom of the screen: it stays visible on every page until acknowledged,
 * without pushing the page down. Its height is published as --bottom-bar so the floating
 * buttons (assistant, SOS, prayer alert) and the end of the page move up above it. It sits
 * below dialogs and bottom sheets (z-40 and up) so it never covers them.
 */
export function PrivacyBanner() {
  const { t, locale, user, setUser } = useApp();
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const show = needsPrivacyAck(user);

  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!show || !el) return;
    const set = () => root.style.setProperty("--bottom-bar", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--bottom-bar");
    };
  }, [show]);

  if (!show) return null;
  async function ok() {
    setBusy(true);
    const res = await fetch("/api/account/privacy", { method: "POST" }).catch(() => null);
    const d = res?.ok ? ((await res.json()) as { user: typeof user }) : null;
    if (d?.user) setUser(d.user);
    setBusy(false);
  }
  const [y, m] = PRIVACY_VERSION.split("-").map(Number);
  const date = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(Date.UTC(y, m - 1, 1));
  return (
    <div ref={ref} role="region" aria-label={t.privacy.title} className="fixed inset-x-0 bottom-0 z-30 border-t border-gold-100 bg-gold-50/95 shadow-[0_-4px_16px_rgb(15_27_45/0.08)] backdrop-blur no-print" data-testid="privacy-banner">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm sm:px-6">
        <p className="min-w-0 flex-1 font-medium text-ink">
          {fmt(t.privacy.banner.text, { date })}{" "}
          <Link href={`/${locale}/privacy`} className="font-semibold text-brand-700 underline">{t.privacy.banner.read}</Link>
        </p>
        <button type="button" onClick={ok} disabled={busy} className="h-9 shrink-0 rounded-md bg-brand-700 px-4 font-semibold text-white hover:bg-brand-800 disabled:opacity-60" data-testid="privacy-ok">{t.privacy.banner.ok}</button>
      </div>
    </div>
  );
}
