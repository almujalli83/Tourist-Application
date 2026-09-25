"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { CURRENCIES } from "@/lib/currency";
import { useApp } from "./app-provider";
import { GlobeIcon, Logo, MenuIcon, UserIcon, XIcon } from "./icons";
import { cx } from "./ui";

export function SiteHeader() {
  const { locale, t, currency, setCurrency, user, setUser } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const otherLocale = locale === "ar" ? "en" : "ar";
  const switchHref = pathname.replace(/^\/(ar|en)(?=\/|$)/, `/${otherLocale}`);

  const links = [
    { href: `/${locale}`, label: t.nav.home },
    { href: `/${locale}/package-visa`, label: t.nav.packageVisa },
    ...(user ? [{ href: `/${locale}/account`, label: t.nav.myBookings }, { href: `/${locale}/account/wallet`, label: t.wallet.nav }] : []),
    ...(user?.isAdmin ? [{ href: `/${locale}/admin`, label: t.admin.nav }] : []),
  ];

  // The most specific matching link is the active one (e.g. /account/wallet over /account).
  const activeHref = links
    .map((l) => l.href)
    .filter((h) => (h === `/${locale}` ? pathname === h : pathname.startsWith(h)))
    .sort((a, b) => b.length - a.length)[0];

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push(`/${locale}`);
    router.refresh();
  }

  const currencySelect = (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">{t.nav.currency}</span>
      <select
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
        className="h-9 rounded-md border border-white/20 bg-white/10 px-2 text-sm font-medium text-white focus:outline-none [&>option]:text-ink"
        aria-label={t.nav.currency}
      >
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>{c.code}</option>
        ))}
      </select>
    </label>
  );

  return (
    <header className="sticky top-0 z-40 bg-brand-900 text-white shadow-md">
      <div className="h-1 bg-gradient-to-l from-gold-500 via-gold-100 to-gold-500" />
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href={`/${locale}`} className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <Logo className="size-9" />
          <span className="flex flex-col leading-tight">
            <span className="text-base font-bold">{t.meta.appName}</span>
            <span className="hidden text-[11px] text-brand-100/80 sm:block">{t.meta.slogan}</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cx(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-white/10",
                l.href === activeHref && "bg-white/10 text-gold-100",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {currencySelect}
          <Link href={switchHref} className="flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium hover:bg-white/10" hrefLang={otherLocale}>
            <GlobeIcon className="size-4" />
            {t.nav.language}
          </Link>
          {user ? (
            <div className="flex items-center gap-1">
              <Link href={`/${locale}/account`} className="flex h-9 items-center gap-1.5 rounded-md bg-white/10 px-3 text-sm font-medium hover:bg-white/15">
                <UserIcon className="size-4" />
                {t.nav.account}
              </Link>
              <button onClick={logout} className="h-9 rounded-md px-3 text-sm text-brand-100 hover:bg-white/10">{t.nav.logout}</button>
            </div>
          ) : (
            <Link href={`/${locale}/login`} className="flex h-9 items-center gap-1.5 rounded-md bg-gold-500 px-4 text-sm font-semibold hover:bg-gold-600">
              <UserIcon className="size-4" />
              {t.nav.login}
            </Link>
          )}
        </div>

        <button className="grid size-10 place-items-center rounded-md hover:bg-white/10 md:hidden" onClick={() => setOpen((o) => !o)} aria-label={t.nav.menu} aria-expanded={open}>
          {open ? <XIcon className="size-6" /> : <MenuIcon className="size-6" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-brand-900 px-4 pb-4 md:hidden">
          <nav className="flex flex-col py-2">
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-md px-3 py-3 text-base font-medium hover:bg-white/10">
                {l.label}
              </Link>
            ))}
            {user ? (
              <>
                <Link href={`/${locale}/account`} onClick={() => setOpen(false)} className="rounded-md px-3 py-3 text-base font-medium hover:bg-white/10">{t.nav.account}</Link>
                <button onClick={() => { setOpen(false); logout(); }} className="rounded-md px-3 py-3 text-start text-base font-medium hover:bg-white/10">{t.nav.logout}</button>
              </>
            ) : (
              <Link href={`/${locale}/login`} onClick={() => setOpen(false)} className="rounded-md px-3 py-3 text-base font-medium hover:bg-white/10">{t.nav.login}</Link>
            )}
          </nav>
          <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3">
            {currencySelect}
            <Link href={switchHref} onClick={() => setOpen(false)} className="flex h-9 items-center gap-1.5 rounded-md bg-white/10 px-3 text-sm font-medium">
              <GlobeIcon className="size-4" />
              {t.nav.language}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
