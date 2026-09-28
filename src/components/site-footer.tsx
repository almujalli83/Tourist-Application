"use client";

import Link from "next/link";
import { useApp } from "./app-provider";
import { Logo } from "./icons";

export function SiteFooter() {
  const { t, locale } = useApp();
  const f = t.footer;
  // Services on the home page (Umrah, guides, prayer, emergency, audio guide…) are not repeated here.
  const groups: { title: string; links: { label: string; href?: string }[] }[] = [
    { title: f.groups.services, links: [{ label: t.reviews.servicesLink, href: "/ratings" }, { label: t.money.nav, href: "/money" }] },
    { title: f.groups.help, links: [{ label: f.support, href: "/support" }, { label: t.a11y.statement, href: "/accessibility" }] },
    { title: f.groups.legal, links: [{ label: f.privacy, href: "/privacy" }, { label: f.terms }] },
  ];
  return (
    <footer className="mt-16 bg-brand-950 text-brand-100">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr]">
        <div className="flex gap-3">
          <Logo className="size-10 shrink-0" />
          <div>
            <p className="font-bold text-white">{t.meta.appName}</p>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-brand-100/80">{t.footer.about}</p>
          </div>
        </div>
        <nav aria-label={t.meta.appName} className="grid grid-cols-2 gap-6 text-sm sm:grid-cols-3">
          {groups.map((g) => (
            <div key={g.title}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-100/60">{g.title}</p>
              <ul className="space-y-2">
                {g.links.map((l) => (
                  <li key={l.label}>{l.href ? <Link href={`/${locale}${l.href}`} className="text-white hover:underline">{l.label}</Link> : <span className="text-brand-100/70">{l.label}</span>}</li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-brand-100/60">
        © {new Date().getFullYear()} {t.meta.appName} — {t.footer.rights}
      </div>
    </footer>
  );
}
