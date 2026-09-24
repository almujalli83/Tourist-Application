"use client";

import { SearchForm } from "@/components/booking/search-form";
import { useBooking } from "@/components/booking/booking-context";
import { Stepper } from "@/components/booking/wizard-shell";
import { useApp } from "@/components/app-provider";
import { BackLink } from "@/components/back-link";
import { Spinner } from "@/components/ui";

export default function PackageVisaSearchPage() {
  const { t, locale } = useApp();
  const { hydrated } = useBooking();
  return (
    <>
      <div className="bg-gradient-to-br from-brand-900 to-brand-700 pb-24 pt-8 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <BackLink href={`/${locale}`} label={t.nav.home} tone="light" className="-ms-2.5 mb-3" />
          <div className="rounded-xl bg-white/95 p-3 text-ink"><Stepper current={0} /></div>
          <h1 className="mt-6 text-2xl font-bold sm:text-3xl">{t.search.title}</h1>
          <p className="mt-1 text-brand-100">{t.search.subtitle}</p>
        </div>
      </div>
      <div className="mx-auto -mt-16 max-w-7xl px-4 sm:px-6">
        {hydrated ? <SearchForm /> : <div className="grid h-64 place-items-center rounded-2xl bg-white"><Spinner className="size-8 text-brand-700" /></div>}
      </div>
    </>
  );
}
