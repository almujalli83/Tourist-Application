"use client";

import Link from "next/link";
import { useState } from "react";
import { needsPrivacyAck } from "@/lib/compliance/privacy-version";
import { useApp } from "./app-provider";

/** Asks signed-in users to read the privacy policy when its version changed since they last did. */
export function PrivacyBanner() {
  const { t, locale, user, setUser } = useApp();
  const [busy, setBusy] = useState(false);
  if (!needsPrivacyAck(user)) return null;
  async function ok() {
    setBusy(true);
    const res = await fetch("/api/account/privacy", { method: "POST" }).catch(() => null);
    const d = res?.ok ? ((await res.json()) as { user: typeof user }) : null;
    if (d?.user) setUser(d.user);
    setBusy(false);
  }
  return (
    <div role="region" aria-label={t.privacy.title} className="border-b border-gold-100 bg-gold-50 no-print" data-testid="privacy-banner">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm sm:px-6">
        <p className="font-medium text-ink">{t.privacy.banner.text}</p>
        <Link href={`/${locale}/privacy`} className="font-semibold text-brand-700 underline">{t.privacy.banner.read}</Link>
        <button type="button" onClick={ok} disabled={busy} className="ms-auto h-8 rounded-md bg-brand-700 px-3 font-semibold text-white hover:bg-brand-800 disabled:opacity-60" data-testid="privacy-ok">{t.privacy.banner.ok}</button>
      </div>
    </div>
  );
}
