"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { fmt } from "@/i18n";
import { todayISO } from "@/lib/dates";
import { validatePackageComposition, validateTraveller } from "@/lib/visa-validation";
import { useApp } from "../app-provider";
import { CheckIcon } from "../icons";
import { Alert, Button, cx } from "../ui";
import { useBooking } from "./booking-context";
import { TravellerForm } from "./traveller-form";
import { WizardShell } from "./wizard-shell";

export function useTravellerValidation() {
  const booking = useBooking();
  return useMemo(() => {
    const outbound = booking.selectedFlights.find((f) => f.kind === "outbound");
    const arrivalDate = outbound?.arriveAt.slice(0, 10) ?? booking.criteria?.departureDate ?? todayISO();
    const ctx = { arrivalDate, returnDate: booking.criteria?.returnDate ?? arrivalDate, today: todayISO(), travellerCount: booking.travellers.length };
    const errors = booking.travellers.map((tr, i) => validateTraveller(tr, i, booking.travellers, ctx));
    const composition = validatePackageComposition(booking.travellers, arrivalDate);
    const valid = errors.every((e) => Object.keys(e).length === 0) && composition.errors.length === 0;
    return { errors, composition, valid };
  }, [booking.travellers, booking.selectedFlights, booking.criteria]);
}

export function TravellersStep() {
  const { t, locale } = useApp();
  const booking = useBooking();
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const { errors, composition, valid } = useTravellerValidation();
  const typeLabel = { adult: t.common.adult, child: t.common.child, infant: t.common.infant };

  function next() {
    if (valid) {
      router.push(`/${locale}/package-visa/review`);
      return;
    }
    setShowErrors(true);
    const first = errors.findIndex((e) => Object.keys(e).length > 0);
    if (first >= 0) setActive(first);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const tr = booking.travellers[active];
  const nextBtn = <Button className="w-full" onClick={next}>{t.common.continue}</Button>;

  return (
    <WizardShell step={4} title={t.travellers.title} subtitle={t.travellers.subtitle} sidebarFooter={nextBtn}>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist">
        {booking.travellers.map((x, i) => {
          const ok = Object.keys(errors[i] ?? {}).length === 0;
          const name = [x.firstNameEn, x.familyNameEn].filter(Boolean).join(" ");
          return (
            <button
              key={i}
              role="tab"
              aria-selected={active === i}
              onClick={() => setActive(i)}
              className={cx(
                "flex min-w-40 shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-start transition",
                active === i ? "border-brand-600 bg-white ring-2 ring-brand-600/40" : "border-slate-200 bg-white/70 hover:bg-white",
              )}
            >
              <span className={cx("grid size-7 place-items-center rounded-full text-xs font-bold", ok ? "bg-brand-600 text-white" : showErrors ? "bg-red-100 text-red-700" : "bg-slate-200 text-slate-600")}>
                {ok ? <CheckIcon className="size-4" /> : i + 1}
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold">{name || fmt(t.travellers.travellerN, { n: i + 1 })}</span>
                <span className="text-xs text-slate-500">{typeLabel[x.paxType]} · {ok ? t.travellers.complete : t.travellers.incomplete}</span>
              </span>
            </button>
          );
        })}
      </div>

      {showErrors && !valid && (
        <Alert tone="error" className="mb-4">
          {t.travellers.fixErrors}
          {composition.errors.map((c) => <p key={c} className="mt-1 font-semibold">{t.travellers.errors[c]}</p>)}
        </Alert>
      )}

      {tr && (
        <TravellerForm
          key={active}
          index={active}
          traveller={tr}
          all={booking.travellers}
          errors={errors[active] ?? {}}
          showErrors={showErrors}
          onChange={(patch) => booking.updateTraveller(active, patch)}
        />
      )}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="secondary" onClick={() => (active > 0 ? setActive(active - 1) : router.push(`/${locale}/package-visa/activities`))}>{t.common.back}</Button>
        {active < booking.travellers.length - 1 ? (
          <Button onClick={() => { setActive(active + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
            {fmt(t.travellers.travellerN, { n: active + 2 })}
          </Button>
        ) : (
          <div className="lg:hidden">{nextBtn}</div>
        )}
      </div>
    </WizardShell>
  );
}
