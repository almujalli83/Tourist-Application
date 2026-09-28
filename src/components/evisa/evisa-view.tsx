"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { fmt } from "@/i18n";
import type { PublicUser } from "@/lib/auth/types";
import { getCountry } from "@/lib/data/countries";
import { evisaEligible } from "@/lib/evisa/eligibility";
import { validateEvisaTravellers } from "@/lib/evisa/validate";
import { pickSavedData, SAVED_FIELDS, type SavedTraveller } from "@/lib/saved-travellers";
import type { PaxType, Traveller } from "@/lib/types";
import { emptyTraveller, type FieldErrors } from "@/lib/visa-validation";
import { useApp } from "../app-provider";
import { AuthForm } from "../auth-form";
import { CountrySelect } from "../booking/country-select";
import { PrivacyPolicy } from "../booking/review-step";
import { SavedTravellerPicker } from "../booking/saved-traveller-picker";
import { TravellerForm } from "../booking/traveller-form";
import { travellerTypeLabel } from "../booking/traveller-label";
import { CheckIcon, LockIcon, PassportIcon } from "../icons";
import { Checkout, type PaymentRef } from "../payments/checkout";
import { saveTraveller, useSavedTravellers } from "../saved-travellers-api";
import { Alert, Button, Card, cx, Field, Input, SectionTitle, Select } from "../ui";

type Step = "start" | "travellers" | "review";
const ksaDay = (plus: number) => new Date(Date.now() + 3 * 3_600_000 + plus * 86_400_000).toISOString().slice(0, 10);
const CONTACT_FIELDS = new Set<string>(["email", "mobileNo", "zipCode"]);

/** Fills a traveller from a saved one (as in the package), keeping contact details already entered. */
function fromSaved(tr: Traveller, saved: SavedTraveller): Partial<Traveller> {
  const defaults = pickSavedData(emptyTraveller(tr.paxType, saved.nationality || tr.nationality));
  const patch: Partial<Traveller> = { savedId: saved.id, saveToAccount: !saved.id.startsWith("fam:") };
  for (const k of SAVED_FIELDS) (patch as Record<string, string>)[k] = saved[k] || (CONTACT_FIELDS.has(k) ? tr[k] : defaults[k]);
  return patch;
}

/** Individuals: the lead traveller's contact details from the account (companies enter their clients'). */
const accountContact = (user: PublicUser | null) => (user && user.accountType !== "company" ? { email: user.email, mobileNo: user.individual?.phone ?? "" } : null);

/**
 * Tourist eVisa without a package, for eligible nationalities: eligibility and arrival date, the
 * travellers (the package's visa form: passport OCR, photo, fields, security and health questions,
 * companions), then review, declarations and one payment.
 */
export function EvisaView() {
  const { t, locale, money, user } = useApp();
  const v = t.evisa;
  const router = useRouter();
  const [step, setStep] = useState<Step>("start");
  const [fee, setFee] = useState<number | null>(null);
  const [nationality, setNationality] = useState("");
  const [arrivalDate, setArrivalDate] = useState(ksaDay(14));
  const [counts, setCounts] = useState({ adult: 1, child: 0, infant: 0 });
  const [clientRef, setClientRef] = useState("");
  const [travellers, setTravellers] = useState<Traveller[]>([]);
  const [active, setActive] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors[] | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saved = useSavedTravellers(!!user, true);

  useEffect(() => {
    fetch("/api/evisa", { cache: "no-store" }).then((r) => r.json()).then((d) => setFee(d.feeSAR)).catch(() => setFee(null));
  }, []);
  useEffect(() => {
    const n = user?.individual?.nationality;
    if (n && !nationality) setNationality(n);
  }, [user, nationality]);

  const eligible = !!nationality && evisaEligible(nationality);
  const count = counts.adult + counts.child + counts.infant;
  const check = useMemo(() => validateEvisaTravellers(travellers, arrivalDate), [travellers, arrivalDate]);
  const errors = (i: number) => ({ ...(check.errors[i] ?? {}), ...(serverErrors?.[i] ?? {}) });
  const valid = check.errors.every((e) => !Object.keys(e).length) && !check.composition.length;
  const total = fee ? Math.round(fee * travellers.length * 100) / 100 : 0;
  const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  function start() {
    // Keep what was already entered when coming back; add or remove travellers to match the counts.
    const want: PaxType[] = [...Array(counts.adult).fill("adult"), ...Array(counts.child).fill("child"), ...Array(counts.infant).fill("infant")];
    const next = want.map((type, i) => (travellers[i]?.paxType === type ? travellers[i] : emptyTraveller(type, nationality)));
    const contact = accountContact(user);
    if (contact && next[0] && !next[0].email) next[0] = { ...next[0], email: contact.email, mobileNo: next[0].mobileNo || contact.mobileNo };
    setTravellers(next);
    setActive(0);
    setStep("travellers");
    scrollTop();
  }

  const update = (i: number, patch: Partial<Traveller>) => {
    setServerErrors(null);
    setTravellers((cur) => cur.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  };

  async function toReview() {
    if (!valid) {
      setShowErrors(true);
      const first = check.errors.findIndex((e) => Object.keys(e).length > 0);
      if (first >= 0) setActive(first);
      scrollTop();
      return;
    }
    // The travellers the user chose to keep in the account (as in the package).
    setSaving(true);
    for (const [i, tr] of travellers.entries()) {
      if (!tr.saveToAccount) continue;
      const res = await saveTraveller(pickSavedData(tr), tr.savedId?.startsWith("fam:") ? null : tr.savedId).catch(() => null);
      if (res) update(i, { savedId: res.id });
    }
    setSaving(false);
    setStep("review");
    scrollTop();
  }

  async function pay(payment: PaymentRef | undefined): Promise<boolean> {
    setErr(null);
    const r = await fetch("/api/evisa", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ arrivalDate, travellers: travellers.map(({ savedId: _s, saveToAccount: _a, ...x }) => x), disclaimerAccepted: accepted, clientReference: clientRef, expectedTotalSAR: total, card: payment }), // eslint-disable-line @typescript-eslint/no-unused-vars
    }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    if (r?.ok) {
      router.push(`/${locale}/account/evisa/${d.application.id}`);
      return true;
    }
    if (d?.error === "invalidTravellers" && Array.isArray(d.details)) {
      setServerErrors(d.details);
      setShowErrors(true);
      setStep("travellers");
      setActive(Math.max(0, (d.details as FieldErrors[]).findIndex((e) => Object.keys(e).length > 0)));
      scrollTop();
    }
    if (d?.error === "priceChanged" && typeof d.details?.totalSAR === "number" && travellers.length) setFee(d.details.totalSAR / travellers.length);
    setErr(v.errors[d?.error as keyof typeof v.errors] ?? v.errors.generic);
    return false;
  }

  const steps: Step[] = ["start", "travellers", "review"];
  return (
    <div className="space-y-5" data-testid="evisa">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl"><PassportIcon className="size-7 text-brand-700" />{v.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{v.intro}</p>
      </div>
      <ol className="flex flex-wrap gap-2 text-sm" aria-label={v.title}>
        {steps.map((s, i) => (
          <li key={s} aria-current={step === s ? "step" : undefined} className={cx("flex items-center gap-2 rounded-full px-3 py-1.5 font-semibold ring-1 ring-inset", step === s ? "bg-brand-700 text-white ring-brand-700" : steps.indexOf(step) > i ? "bg-brand-50 text-brand-800 ring-brand-700/20" : "bg-white text-slate-500 ring-slate-200")}>
            <span className="ltr-nums">{i + 1}</span>{v.steps[s]}
          </li>
        ))}
      </ol>
      {err && <Alert tone="error"><span data-testid="evisa-error">{err}</span></Alert>}

      {step === "start" && (
        <Card className="space-y-4 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={v.nationality} htmlFor="ev-nat" required><CountrySelect id="ev-nat" value={nationality} onChange={setNationality} /></Field>
            <Field label={v.arrival} htmlFor="ev-arrival" hint={v.arrivalHint} required>
              <Input id="ev-arrival" type="date" dir="ltr" min={ksaDay(0)} max={ksaDay(365)} value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} data-testid="ev-arrival" />
            </Field>
          </div>
          {nationality && (eligible
            ? <Alert tone="success"><span data-testid="ev-eligible">{v.eligible}</span></Alert>
            : (
              <Alert tone="warning">
                <span data-testid="ev-not-eligible">{v.notEligible}</span>{" "}
                <Link href={`/${locale}/package-visa`} className="font-semibold underline">{v.toPackage}</Link>
              </Alert>
            ))}
          {eligible && (
            <>
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-slate-700">{v.travellers}</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(["adult", "child", "infant"] as const).map((k) => (
                    <Field key={k} label={t.standalone.flights.pax[k === "adult" ? "adults" : k === "child" ? "children" : "infants"]} htmlFor={`ev-${k}`}>
                      <Select id={`ev-${k}`} value={counts[k]} onChange={(e) => setCounts({ ...counts, [k]: Number(e.target.value) })} data-testid={`ev-${k}`}>
                        {Array.from({ length: k === "adult" ? 9 : 6 }, (_, i) => i + (k === "adult" ? 1 : 0)).map((n) => <option key={n} value={n}>{n}</option>)}
                      </Select>
                    </Field>
                  ))}
                </div>
              </fieldset>
              {user?.accountType === "company" && (
                <Field label={v.clientRef} htmlFor="ev-ref"><Input id="ev-ref" value={clientRef} maxLength={60} onChange={(e) => setClientRef(e.target.value)} /></Field>
              )}
              {fee !== null && <p className="text-sm text-slate-700">{fmt(v.feeEach, { amount: money(fee) })} · {v.total}: <span className="ltr-nums font-bold">{money(fee * count)}</span></p>}
              <Button onClick={start} data-testid="ev-start">{v.start}</Button>
            </>
          )}
        </Card>
      )}

      {step === "travellers" && !user && (
        <Card className="p-5 sm:p-6">
          <SectionTitle title={t.travellers.loginTitle} icon={<LockIcon className="size-5" />} subtitle={v.signIn} />
          <div className="mt-5 max-w-2xl"><AuthForm compact onSuccess={scrollTop} /></div>
        </Card>
      )}

      {step === "travellers" && user && travellers[active] && (
        <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
            {travellers.map((x, i) => {
              const ok = !Object.keys(errors(i)).length;
              const name = [x.firstNameEn, x.familyNameEn].filter(Boolean).join(" ");
              return (
                <button key={i} role="tab" aria-selected={active === i} onClick={() => setActive(i)} data-testid={`ev-tab-${i}`}
                  className={cx("flex min-w-40 shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-start transition", active === i ? "border-brand-600 bg-white ring-2 ring-brand-600/40" : "border-slate-200 bg-white/70 hover:bg-white")}>
                  <span className={cx("grid size-7 place-items-center rounded-full text-xs font-bold", ok ? "bg-brand-600 text-white" : showErrors ? "bg-red-100 text-red-700" : "bg-slate-200 text-slate-600")}>
                    {ok ? <CheckIcon className="size-4" /> : i + 1}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">{name || fmt(t.travellers.travellerN, { n: i + 1 })}</span>
                    <span className="text-xs text-slate-500">{travellerTypeLabel(t, x)} · {ok ? t.travellers.complete : t.travellers.incomplete}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {showErrors && !valid && (
            <Alert tone="error">
              {t.travellers.fixErrors}
              {check.composition.map((c) => <p key={c} className="mt-1 font-semibold">{t.travellers.errors[c]}</p>)}
            </Alert>
          )}
          <SavedTravellerPicker key={`p${active}`} id={`t${active}-saved`} saved={saved.list} value={travellers[active].savedId} usedIds={travellers.map((x) => x.savedId).filter((x): x is string => !!x)}
            arrivalDate={arrivalDate} onPick={(s) => update(active, fromSaved(travellers[active], s))} />
          <TravellerForm key={`f${active}`} index={active} traveller={travellers[active]} all={travellers} errors={errors(active)} showErrors={showErrors} onChange={(patch) => update(active, patch)} />
          <Card className="p-4 sm:p-5">
            <label className="flex cursor-pointer items-start gap-3 text-sm font-medium text-ink">
              <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-brand-700" checked={!!travellers[active].saveToAccount} onChange={(e) => update(active, { saveToAccount: e.target.checked })} />
              <span>{travellers[active].savedId && !travellers[active].savedId!.startsWith("fam:") ? t.travellers.saved.saveUpdate : t.travellers.saved.saveNew}<span className="mt-1 block text-xs font-normal text-slate-500">{t.travellers.saved.saveNote}</span></span>
            </label>
          </Card>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <Button variant="secondary" onClick={() => (active > 0 ? setActive(active - 1) : setStep("start"))}>{v.back}</Button>
            {active < travellers.length - 1
              ? <Button onClick={() => { setActive(active + 1); scrollTop(); }} data-testid="ev-next-traveller">{fmt(t.travellers.travellerN, { n: active + 2 })}</Button>
              : <Button onClick={() => void toReview()} loading={saving} data-testid="ev-to-review">{v.next}</Button>}
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <Card className="p-5 sm:p-6">
              <SectionTitle title={v.review} icon={<PassportIcon className="size-5" />} />
              <ul className="mt-4 divide-y divide-slate-100 text-sm">
                {travellers.map((x, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="ev-review-traveller">
                    <span className="font-semibold" dir="ltr">{[x.firstNameEn, x.middleNameEn, x.familyNameEn].filter(Boolean).join(" ")}</span>
                    <span className="text-xs text-slate-600">{travellerTypeLabel(t, x)} · {getCountry(x.nationality)?.[locale] ?? x.nationality} · <span dir="ltr">{x.passportNo}</span>{x.sponsorIndex !== null && travellers[x.sponsorIndex] ? ` · ${fmt(v.companion, { name: travellers[x.sponsorIndex].firstNameEn })}` : ""}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-slate-600">{fmt(v.arrivalOn, { date: arrivalDate })}</p>
            </Card>
            <PrivacyPolicy accepted={accepted} onChange={setAccepted} />
            <Button variant="secondary" onClick={() => setStep("travellers")}>{v.back}</Button>
          </div>
          <Card className="h-fit space-y-4 p-5 lg:sticky lg:top-20" data-testid="ev-pay-card">
            {fee !== null && <p className="text-sm">{fmt(v.feeEach, { amount: money(fee) })}</p>}
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="font-semibold">{v.total} ({travellers.length})</span>
              <span className="ltr-nums text-lg font-bold text-brand-800" data-testid="ev-total">{money(total)}</span>
            </div>
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{v.feeNote}</p>
            {!accepted && <p className="text-sm text-amber-800" role="status">{v.errors.disclaimerRequired}</p>}
            <Checkout amountSAR={total} description={`Tourist eVisa × ${travellers.length}`} disabled={!accepted || !fee} label={v.pay} onPay={pay} testId="ev-pay" />
          </Card>
        </div>
      )}
    </div>
  );
}
