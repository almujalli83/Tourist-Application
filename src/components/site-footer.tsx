"use client";

import Link from "next/link";
import { useApp } from "./app-provider";
import { Logo } from "./icons";

export function SiteFooter() {
  const { t, locale } = useApp();
  return (
    <footer className="mt-16 bg-brand-950 text-brand-100">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[2fr_1fr]">
        <div className="flex gap-3">
          <Logo className="size-10 shrink-0" />
          <div>
            <p className="font-bold text-white">{t.meta.appName}</p>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-brand-100/80">{t.footer.about}</p>
          </div>
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm md:justify-end">
          <li><Link href={`/${locale}/ratings`} className="font-semibold text-white hover:underline">{t.reviews.servicesLink}</Link></li>
          <li>{t.footer.support}</li>
          <li>{t.footer.privacy}</li>
          <li>{t.footer.terms}</li>
        </ul>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-brand-100/60">
        © {new Date().getFullYear()} {t.meta.appName} — {t.footer.rights}
      </div>
    </footer>
  );
}
