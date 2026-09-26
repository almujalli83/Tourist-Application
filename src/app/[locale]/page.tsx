import Link from "next/link";
import { BuildingIcon, CalendarIcon, CheckIcon, HotelIcon, PassportIcon, PlaneIcon, ShieldIcon, TicketIcon, UserIcon } from "@/components/icons";
import { getDictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";

export default async function HomePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = getDictionary(locale);
  const howIcons = [CalendarIcon, PlaneIcon, HotelIcon, PassportIcon, ShieldIcon];
  const trustIcons = [ShieldIcon, CheckIcon, BuildingIcon];

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 text-white">
        <div className="pattern-bg absolute inset-0" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-gold-100 ring-1 ring-white/15">
              <PassportIcon className="size-4" />
              {t.nav.packageVisa}
            </span>
            <h1 className="mt-5 text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">{t.home.heroTitle}</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-brand-100 sm:text-lg">{t.home.heroSubtitle}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`/${locale}/package-visa`} className="inline-flex h-12 items-center gap-2 rounded-lg bg-gold-500 px-7 text-base font-semibold shadow-lg shadow-black/10 hover:bg-gold-600">
                {t.home.startNow}
              </Link>
              <Link href={`/${locale}/planner`} className="inline-flex h-12 items-center gap-2 rounded-lg bg-white/10 px-6 text-base font-semibold ring-1 ring-white/20 hover:bg-white/15">
                <CalendarIcon className="size-5" />
                {t.planner.banner.cta}
              </Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {t.home.trust.map((x, i) => {
              const Icon = trustIcons[i];
              return (
                <div key={x.t} className="flex gap-3 rounded-xl bg-white/[0.07] p-4 ring-1 ring-white/10 backdrop-blur">
                  <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-gold-500/20 text-gold-100"><Icon className="size-5" /></div>
                  <div>
                    <p className="font-semibold">{x.t}</p>
                    <p className="mt-0.5 text-sm text-brand-100/85">{x.d}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-bold text-ink">{t.home.servicesTitle}</h2>
        <p className="mt-1 text-slate-500">{t.home.servicesSubtitle}</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href={`/${locale}/package-visa`} className="group relative flex flex-col rounded-2xl border-2 border-brand-600 bg-white p-6 shadow-sm transition hover:shadow-md sm:col-span-2 lg:col-span-1 lg:row-span-2">
            <div className="grid size-12 place-items-center rounded-xl bg-brand-700 text-white"><PassportIcon className="size-6" /></div>
            <h3 className="mt-4 text-lg font-bold">{t.nav.packageVisa}</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{t.home.packageVisaDesc}</p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-medium text-brand-800">
              <span className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-1"><UserIcon className="size-3.5" />B2C · {t.nav.individual}</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-1"><BuildingIcon className="size-3.5" />B2B · {t.nav.business}</span>
            </div>
            <span className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-brand-700 text-sm font-semibold text-white group-hover:bg-brand-800">{t.home.startNow}</span>
          </Link>
          <Link href={`/${locale}/planner`} className="group flex items-center gap-4 rounded-2xl border border-gold-500/40 bg-gold-50 p-5 transition hover:shadow-md">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-gold-500 text-ink"><CalendarIcon className="size-5" /></div>
            <div className="flex-1">
              <p className="font-semibold text-ink">{t.planner.title}</p>
              <p className="mt-0.5 text-sm text-slate-600">{t.planner.banner.desc}</p>
            </div>
          </Link>
          {t.home.comingServices.map((s, i) => {
            const Icon = [PassportIcon, TicketIcon, PlaneIcon, UserIcon][i] ?? TicketIcon;
            return (
              <div key={s} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white/60 p-5">
                <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500"><Icon className="size-5" /></div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-700">{s}</p>
                  <span className="mt-1 inline-block rounded bg-gold-50 px-2 py-0.5 text-xs font-semibold text-gold-700">{t.common.comingSoon}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-bold text-ink">{t.home.howTitle}</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {t.home.how.map((s, i) => {
              const Icon = howIcons[i];
              return (
                <li key={s.t} className="relative rounded-2xl bg-surface p-5">
                  <span className="absolute end-4 top-4 text-3xl font-bold text-brand-100">{i + 1}</span>
                  <div className="grid size-10 place-items-center rounded-lg bg-brand-700 text-white"><Icon className="size-5" /></div>
                  <p className="mt-4 font-semibold">{s.t}</p>
                  <p className="mt-1 text-sm text-slate-600">{s.d}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>
    </>
  );
}
