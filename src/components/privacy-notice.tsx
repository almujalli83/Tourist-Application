"use client";

import Link from "next/link";
import { useApp } from "./app-provider";

/** Shown on every sign-up form: the account is created after the privacy notice is presented. */
export function PrivacyNotice() {
  const { t, locale } = useApp();
  return (
    <p className="text-xs text-slate-600" data-testid="privacy-notice">
      {t.privacy.signupNotice}{" "}
      <Link href={`/${locale}/privacy`} target="_blank" className="font-semibold text-brand-700 underline">{t.privacy.signupLink}</Link>.
    </p>
  );
}
