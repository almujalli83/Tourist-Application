"use client";

import { useRouter } from "next/navigation";
import { fmt } from "@/i18n";
import { cityName } from "@/lib/data/cities";
import { useApp } from "../app-provider";
import { MapPinIcon, TicketIcon } from "../icons";
import { Alert, Badge, Button, Card, cx, Spinner } from "../ui";
import { useBooking, type ActivityStayResult } from "./booking-context";
import { PackageRequirements, usePackageCheck } from "./package-requirements";
import { useFetchStep } from "./use-fetch-step";
import { WizardShell } from "./wizard-shell";

export function ActivitiesStep() {
  const { t, locale, money } = useApp();
  const booking = useBooking();
  const router = useRouter();
  const { loading, error, retry } = useFetchStep<{ stays: ActivityStayResult[] }>(
    booking.hydrated && !!booking.criteria && !booking.activityResults,
    "/api/search/activities",
    booking.criteria,
    (d) => booking.setActivityResults(d.stays),
  );
  // The visa form opens only for packages meeting the key package requirements.
  const check = usePackageCheck();
  const blocked = !check.ok;
  const next = (
    <div className="flex flex-col gap-1.5">
      <Button className="w-full" disabled={blocked} onClick={() => router.push(`/${locale}/package-visa/esim`)}>
        {booking.activities.length ? t.common.continue : t.activities.skip}
      </Button>
      {blocked && !check.loading && <p className="text-center text-xs font-medium text-red-700">{t.packageRules.continueHint}</p>}
    </div>
  );
  return (
    <WizardShell step={3} title={t.activities.title} subtitle={t.activities.subtitle} sidebarFooter={next}>
      {loading && <div className="flex items-center gap-3 rounded-xl bg-white p-6 text-brand-700"><Spinner className="size-6" />{t.flights.searching}</div>}
      {error && <Alert tone="error">{(t.review.errors as Record<string, string>)[error] ?? t.review.errors.generic} <button className="font-semibold underline" onClick={retry}>{t.common.retry}</button></Alert>}
      <PackageRequirements state={check} className="mb-6" />
      <div className="space-y-8">
        {booking.activityResults?.map(({ stay, offers }) => (
          <section key={stay.city} className="space-y-3">
            <h2 className="flex items-center gap-2 font-bold"><MapPinIcon className="size-5 text-gold-600" />{cityName(stay.city, locale)}</h2>
            {offers.length === 0 && <p className="text-sm text-slate-500">{t.common.noResults}</p>}
            <div className="grid gap-3 md:grid-cols-2">
              {offers.map((a) => {
                const on = booking.activities.includes(a.id);
                return (
                  <Card key={a.id} className={cx("flex flex-col p-4", on && "border-brand-600 ring-2 ring-brand-600/60")}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex gap-3">
                        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-gold-50 text-gold-700"><TicketIcon className="size-5" /></div>
                        <div>
                          <p className="font-semibold">{locale === "ar" ? a.titleAr : a.titleEn}</p>
                          <p className="text-xs text-slate-500">{locale === "ar" ? a.venueAr : a.venueEn}</p>
                        </div>
                      </div>
                      <Badge tone="brand">{t.activities.kinds[a.kind]}</Badge>
                    </div>
                    <p className="ltr-nums mt-3 text-xs text-slate-600">{a.date} · {a.timeFrom}–{a.timeTo}</p>
                    <Badge tone="gold" className="mt-2 self-start">{t.common.agent}: {locale === "ar" ? a.agentNameAr : a.agentNameEn}</Badge>
                    <div className="mt-auto flex items-end justify-between gap-2 pt-3">
                      <div>
                        <p className="ltr-nums font-bold text-brand-800">{money(a.totalSAR)}</p>
                        <p className="text-[11px] text-slate-500">{fmt(t.activities.forParty, { n: a.partySize, price: money(a.totalSAR / a.partySize) })}</p>
                      </div>
                      <Button size="sm" variant={on ? "primary" : "secondary"} onClick={() => booking.toggleActivity(a.id)} aria-pressed={on}>
                        {on ? t.activities.remove : t.activities.add}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between lg:hidden">
        <Button variant="secondary" onClick={() => router.push(`/${locale}/package-visa/hotels`)}>{t.common.back}</Button>
        {next}
      </div>
    </WizardShell>
  );
}
