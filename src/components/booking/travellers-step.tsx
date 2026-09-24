"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmt } from "@/i18n";
import { todayISO } from "@/lib/dates";
import { pickSavedData, SAVED_FIELDS, type SavedTraveller } from "@/lib/saved-travellers";
import type { PublicUser } from "@/lib/auth/types";
import type { Traveller } from "@/lib/types";
import { emptyTraveller, validatePackageComposition, validateTraveller } from "@/lib/visa-validation";
import { useApp } from "../app-provider";
import { AuthForm } from "../auth-form";
import { CheckIcon, LockIcon } from "../icons";
import { fetchSavedTraveller, saveTraveller, useSavedTravellers } from "../saved-travellers-api";
import { Alert, Button, Card, cx, SectionTitle } from "../ui";
import { useBooking } from "./booking-context";
import { SavedTravellerPicker } from "./saved-traveller-picker";
import { TravellerForm } from "./traveller-form";
import { WizardShell } from "./wizard-shell";

function useArrivalDate() {
  const booking = useBooking();
  const outbound = booking.selectedFlights.find((f) => f.kind === "outbound");
  return outbound?.arriveAt.slice(0, 10) ?? booking.criteria?.departureDate ?? todayISO();
}

export function useTravellerValidation() {
  const booking = useBooking();
  const arrivalDate = useArrivalDate();
  return useMemo(() => {
    const ctx = { arrivalDate, returnDate: booking.criteria?.returnDate ?? arrivalDate, today: todayISO(), travellerCount: booking.travellers.length };
    const errors = booking.travellers.map((tr, i) => validateTraveller(tr, i, booking.travellers, ctx));
    const composition = validatePackageComposition(booking.travellers, arrivalDate);
    const valid = errors.every((e) => Object.keys(e).length === 0) && composition.errors.length === 0;
    return { errors, composition, valid };
  }, [booking.travellers, booking.criteria, arrivalDate]);
}

/** Traveller details are personal data: they are entered only once the user is signed in. */
export function TravellersStep() {
  const { t, user } = useApp();
  if (user) return <TravellersForms />;
  return (
    <WizardShell step={4} title={t.travellers.title} subtitle={t.travellers.subtitle}>
      <Card className="p-5 sm:p-6">
        <SectionTitle title={t.travellers.loginTitle} icon={<LockIcon className="size-5" />} subtitle={t.travellers.loginIntro} />
        <div className="mt-5 max-w-2xl">
          <AuthForm compact onSuccess={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
        </div>
      </Card>
    </WizardShell>
  );
}

const CONTACT_FIELDS = new Set<string>(["email", "mobileNo", "zipCode"]);

/**
 * Fills the form from a saved traveller. Fields the saved record lacks get the form defaults,
 * except contact details, which keep what is already entered (e.g. the account's own).
 */
function fromSaved(tr: Traveller, saved: SavedTraveller): Partial<Traveller> {
  const defaults = pickSavedData(emptyTraveller(tr.paxType, saved.nationality || tr.nationality));
  const patch: Partial<Traveller> = { savedId: saved.id, saveToAccount: true };
  for (const k of SAVED_FIELDS) (patch as Record<string, string>)[k] = saved[k] || (CONTACT_FIELDS.has(k) ? tr[k] : defaults[k]);
  return patch;
}

/** The signed-in account's email and mobile, used to pre-fill the lead traveller's contact details. */
function accountContact(user: PublicUser): { email: string; mobileNo: string } {
  const phone = user.accountType === "company" ? user.company?.phone : user.individual?.phone;
  return { email: user.email, mobileNo: phone ?? "" };
}

function TravellersForms() {
  const { t, locale, user } = useApp();
  const booking = useBooking();
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const { errors, composition, valid } = useTravellerValidation();
  const arrivalDate = useArrivalDate();
  const saved = useSavedTravellers(true);
  const typeLabel = { adult: t.common.adult, child: t.common.child, infant: t.common.infant };

  // Images are not kept across page reloads; restore those of travellers picked from the account.
  const restored = useRef(false);
  const { hydrated, travellers, updateTraveller } = booking;
  useEffect(() => {
    if (!hydrated || restored.current) return;
    restored.current = true;
    travellers.forEach((tr, i) => {
      if (!tr.savedId || (tr.personPhoto && tr.passportImage)) return;
      fetchSavedTraveller(tr.savedId)
        .then((s) => updateTraveller(i, { personPhoto: tr.personPhoto || s.personPhoto, passportImage: tr.passportImage || s.passportImage }))
        .catch(() => undefined);
    });
  }, [hydrated, travellers, updateTraveller]);

  // Pre-fill the lead traveller's empty contact fields from the account (once, never overwriting).
  const prefilled = useRef(false);
  useEffect(() => {
    if (!hydrated || prefilled.current || !user || !travellers[0]) return;
    prefilled.current = true;
    const lead = travellers[0];
    const contact = accountContact(user);
    const patch: Partial<Traveller> = {};
    if (!lead.email.trim() && contact.email) patch.email = contact.email;
    if (!lead.mobileNo.trim() && contact.mobileNo) patch.mobileNo = contact.mobileNo;
    if (Object.keys(patch).length) updateTraveller(0, patch);
  }, [hydrated, travellers, updateTraveller, user]);

  /** Saves the travellers the user chose to keep; returns false if any failed. */
  async function saveChosen(): Promise<boolean> {
    let ok = true;
    for (const [i, tr] of booking.travellers.entries()) {
      if (!tr.saveToAccount) continue;
      try {
        const res = await saveTraveller(pickSavedData(tr), tr.savedId);
        booking.updateTraveller(i, { savedId: res.id });
      } catch {
        ok = false;
      }
    }
    void saved.reload();
    return ok;
  }

  async function next() {
    if (valid) {
      if (!saveFailed) {
        setSaving(true);
        const ok = await saveChosen();
        setSaving(false);
        if (!ok) {
          setSaveFailed(true);
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
      }
      router.push(`/${locale}/package-visa/review`);
      return;
    }
    setShowErrors(true);
    const first = errors.findIndex((e) => Object.keys(e).length > 0);
    if (first >= 0) setActive(first);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const tr = booking.travellers[active];
  const nextBtn = (
    <Button className="w-full" onClick={() => void next()} loading={saving}>
      {saving ? t.travellers.saved.saving : t.common.continue}
    </Button>
  );
  const usedIds = booking.travellers.map((x) => x.savedId).filter((x): x is string => !!x);

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

      {saveFailed && <Alert tone="warning" className="mb-4">{t.travellers.saved.saveFailed}</Alert>}

      {showErrors && !valid && (
        <Alert tone="error" className="mb-4">
          {t.travellers.fixErrors}
          {composition.errors.map((c) => <p key={c} className="mt-1 font-semibold">{t.travellers.errors[c]}</p>)}
        </Alert>
      )}

      {tr && (
        <div className="mb-4">
          <SavedTravellerPicker
            key={active}
            id={`t${active}-saved`}
            saved={saved.list}
            value={tr.savedId}
            usedIds={usedIds}
            arrivalDate={arrivalDate}
            onPick={(s) => booking.updateTraveller(active, fromSaved(tr, s))}
          />
        </div>
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

      {tr && (
        <Card className="mt-4 p-4 sm:p-5">
          <label className="flex cursor-pointer items-start gap-3 text-sm font-medium text-ink">
            <input
              type="checkbox"
              className="mt-0.5 size-5 shrink-0 accent-brand-700"
              checked={!!tr.saveToAccount}
              onChange={(e) => booking.updateTraveller(active, { saveToAccount: e.target.checked })}
            />
            <span>
              {tr.savedId ? t.travellers.saved.saveUpdate : t.travellers.saved.saveNew}
              <span className="mt-1 block text-xs font-normal text-slate-500">{t.travellers.saved.saveNote}</span>
            </span>
          </label>
        </Card>
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
