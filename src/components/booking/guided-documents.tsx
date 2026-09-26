"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fmt } from "@/i18n";
import { COMPANION_TYPES } from "@/lib/mt-evisa/lookups";
import type { Traveller, YesNo } from "@/lib/types";
import { SECURITY_CLARIFIED, SECURITY_SIMPLE } from "@/lib/visa-validation";
import { useApp } from "../app-provider";
import { CheckIcon, LockIcon } from "../icons";
import { PhoneInput } from "../phone-input";
import { Alert, Button, Card, cx, Field, Input, Select, Textarea, YesNo as YesNoInput } from "../ui";
import { AuthForm } from "../auth-form";
import { useBooking } from "./booking-context";
import { CountrySelect } from "./country-select";
import { passportPatch } from "./passport-fill";
import { PassportScanner } from "./passport-scanner";
import { PhotoUploader } from "./photo-uploader";
import { TravellerForm } from "./traveller-form";
import { travellerTypeLabel } from "./traveller-label";
import { useTravellerValidation } from "./travellers-step";
import { WizardShell } from "./wizard-shell";

const IMAGE_KEYS = new Set(["passportImage", "personPhoto"]);
const isDeclaration = (k: string) => k.startsWith("security.") || k.startsWith("insurance.");
const DATE_KEYS = new Set(["birthDate", "passportIssueDate", "passportExpiryDate"]);
const COUNTRY_KEYS = new Set(["birthplace", "nationality", "passportIssuePlace"]);

function Bubble({ children, from = "assistant" }: { children: ReactNode; from?: "assistant" | "system" }) {
  const { t } = useApp();
  return (
    <div className="flex items-start gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-700 text-xs font-bold text-white" aria-hidden>AI</span>
      <div className={cx("max-w-[42rem] rounded-2xl rounded-ss-sm px-4 py-3 text-sm leading-relaxed", from === "assistant" ? "bg-brand-50 text-ink" : "bg-emerald-50 text-emerald-900")}>
        <span className="sr-only">{t.planner.docs.assistant}: </span>
        {children}
      </div>
    </div>
  );
}

/**
 * Visa details for a carried-out plan: an assistant asks for each traveller's passport and
 * personal photo, fills the visa form from the passport, then asks only what is still missing.
 */
export function GuidedDocuments() {
  const { t, locale, user } = useApp();
  const d = t.planner.docs;
  const booking = useBooking();
  const { errors, composition, valid } = useTravellerValidation();
  const [active, setActive] = useState(0);
  const started = useRef(false);

  // Contact details: the account's own for the lead traveller, then shared with the others.
  const { hydrated, travellers, updateTraveller } = booking;
  useEffect(() => {
    if (!hydrated || !user || started.current || !travellers.length) return;
    started.current = true;
    const lead = user.accountType !== "company" && !travellers[0].email
      ? { email: user.email, mobileNo: travellers[0].mobileNo || user.individual?.phone || "" }
      : { email: travellers[0].email, mobileNo: travellers[0].mobileNo };
    if (lead.email !== travellers[0].email) updateTraveller(0, lead);
    // The others share the lead traveller's contact details unless they have their own.
    travellers.forEach((tr, i) => {
      if (i > 0 && !tr.email && lead.email) updateTraveller(i, { email: lead.email, mobileNo: tr.mobileNo || lead.mobileNo });
    });
    setActive(Math.max(0, errors.findIndex((e) => Object.keys(e).length > 0)));
  }, [hydrated, user, travellers, updateTraveller, errors]);

  if (!user) {
    return (
      <WizardShell step={5} title={d.title} subtitle={d.subtitle}>
        <Card className="p-5 sm:p-6">
          <p className="flex items-center gap-2 font-bold"><LockIcon className="size-5" />{t.travellers.loginTitle}</p>
          <div className="mt-4 max-w-2xl"><AuthForm compact onSuccess={() => window.scrollTo({ top: 0 })} /></div>
        </Card>
      </WizardShell>
    );
  }

  const nameOf = (tr: Traveller, i: number) => [tr.firstNameEn, tr.familyNameEn].filter(Boolean).join(" ") || `${fmt(d.travellerN, { n: i + 1 })} (${travellerTypeLabel(t, tr)})`;

  return (
    <WizardShell step={5} title={d.title} subtitle={d.subtitle}>
      <div className="space-y-4" data-testid="guided-documents">
        <p className="flex items-center gap-2 text-xs text-slate-500"><LockIcon className="size-4" />{d.privacy}</p>
        {travellers.map((tr, i) => {
          const done = Object.keys(errors[i] ?? {}).length === 0;
          return (
            <Card key={i} className={cx("overflow-hidden", i === active && "ring-2 ring-brand-600")} data-testid={`guided-traveller-${i}`}>
              <button type="button" onClick={() => setActive(i)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-start" aria-expanded={i === active}>
                <span className="font-bold">{nameOf(tr, i)}</span>
                {done ? <span className="flex items-center gap-1 text-sm font-semibold text-brand-700"><CheckIcon className="size-4" />✓</span> : <span className="text-xs text-slate-500">{fmt(d.travellerN, { n: i + 1 })}</span>}
              </button>
              {i === active && (
                <div className="border-t border-slate-100 px-4 py-5 sm:px-5">
                  <GuidedTraveller index={i} name={nameOf(tr, i)} onNext={() => setActive(Math.min(travellers.length - 1, errors.findIndex((e, k) => k !== i && Object.keys(e).length > 0) >= 0 ? errors.findIndex((e, k) => k !== i && Object.keys(e).length > 0) : i))} />
                </div>
              )}
            </Card>
          );
        })}
        {composition.errors.length > 0 && <Alert tone="error">{d.composition}</Alert>}
        {valid && (
          <Card className="space-y-3 border-2 border-brand-600 p-5" data-testid="guided-complete">
            <Bubble from="system">{d.complete}</Bubble>
            <Link href={`/${locale}/package-visa/review`} className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-brand-700 text-base font-semibold text-white hover:bg-brand-800">{d.pay}</Link>
          </Card>
        )}
      </div>
    </WizardShell>
  );
}

function GuidedTraveller({ index, name, onNext }: { index: number; name: string; onNext: () => void }) {
  const { t, locale } = useApp();
  const d = t.planner.docs;
  const tf = t.travellers.fields;
  const booking = useBooking();
  const { errors } = useTravellerValidation();
  const tr = booking.travellers[index];
  const errs = useMemo(() => errors[index] ?? {}, [errors, index]);
  const [scan, setScan] = useState<{ read: boolean; n: number } | null>(null);
  const [asked, setAsked] = useState<string[]>([]);
  const [showQuestions, setShowQuestions] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const filledCount = useRef(0);
  const update = (patch: Partial<Traveller>) => booking.updateTraveller(index, patch);

  const docsIn = !!tr.passportImage && !!tr.personPhoto;
  // Questions are fixed once asked, so a field doesn't disappear while it is being typed.
  const missing = useMemo(() => Object.keys(errs).filter((k) => !IMAGE_KEYS.has(k) && !isDeclaration(k)), [errs]);
  const missingKey = missing.join("|");
  useEffect(() => {
    if (!docsIn) return;
    setAsked((cur) => [...cur, ...missingKey.split("|").filter((k) => k && !cur.includes(k))]);
  }, [docsIn, missingKey]);
  const done = Object.keys(errs).length === 0;

  const allNo = () =>
    update({
      security: {
        ...Object.fromEntries(SECURITY_CLARIFIED.map((k) => [k, { answer: "false" as const, clarification: "" }])),
        ...Object.fromEntries(SECURITY_SIMPLE.map((k) => [k, "false" as const])),
      } as unknown as Traveller["security"],
      insurance: { ...tr.insurance, question1: "false", question2: "false", question3: "false", question6: tr.insurance.question6 || "0" },
    });
  const allAnsweredNo = SECURITY_CLARIFIED.every((k) => tr.security[k].answer === "false") && SECURITY_SIMPLE.every((k) => tr.security[k] === "false")
    && tr.insurance.question1 === "false" && tr.insurance.question2 === "false" && tr.insurance.question3 === "false";

  const errText = (k: string) => (errs[k] ? (t.travellers.errors as Record<string, string>)[errs[k]] ?? errs[k] : undefined);
  const field = (k: string) => {
    const id = `g${index}-${k}`;
    const label = (tf as Record<string, string>)[k] ?? k;
    const value = String((tr as unknown as Record<string, unknown>)[k] ?? "");
    const e = errText(k);
    let input: ReactNode;
    if (DATE_KEYS.has(k)) input = <Input id={id} type="date" value={value} onChange={(ev) => update({ [k]: ev.target.value } as Partial<Traveller>)} invalid={!!e} />;
    else if (COUNTRY_KEYS.has(k)) input = <CountrySelect id={id} value={value} onChange={(v) => update({ [k]: v } as Partial<Traveller>)} invalid={!!e} />;
    else if (k === "mobileNo") input = <PhoneInput id={id} value={tr.mobileNo} defaultCountry={tr.nationality} onChange={(v) => update({ mobileNo: v })} invalid={!!e} />;
    else if (k === "gender" || k === "religion" || k === "maritalStatus" || k === "passportType") {
      const opts = k === "gender" ? t.travellers.genders : k === "religion" ? t.travellers.religions : k === "maritalStatus" ? t.travellers.marital : t.travellers.passportTypes;
      input = (
        <Select id={id} value={value} onChange={(ev) => update({ [k]: ev.target.value } as Partial<Traveller>)} invalid={!!e}>
          <option value="">—</option>
          {Object.entries(opts).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      );
    } else if (k === "companionType") {
      input = (
        <Select id={id} value={tr.companionType} onChange={(ev) => update({ companionType: ev.target.value })} invalid={!!e}>
          <option value="">—</option>
          {COMPANION_TYPES.map((c) => <option key={c.code} value={c.code}>{c[locale]}</option>)}
        </Select>
      );
    } else if (k === "sponsorIndex") {
      input = (
        <Select id={id} value={tr.sponsorIndex === null ? "" : String(tr.sponsorIndex)} onChange={(ev) => update({ sponsorIndex: ev.target.value === "" ? null : Number(ev.target.value) })} invalid={!!e}>
          <option value="">{tf.noSponsor}</option>
          {booking.travellers.map((o, i) => (i !== index && o.paxType === "adult" && o.declaredAge == null ? <option key={i} value={i}>{[o.firstNameEn, o.familyNameEn].filter(Boolean).join(" ") || fmt(d.travellerN, { n: i + 1 })}</option> : null))}
        </Select>
      );
    } else {
      const latin = k.endsWith("En") || k === "passportNo" || k === "email" || k === "zipCode";
      input = <Input id={id} type={k === "email" ? "email" : "text"} dir={k.endsWith("Ar") ? "rtl" : latin ? "ltr" : undefined} value={value} onChange={(ev) => update({ [k]: latin && k !== "email" ? ev.target.value.toUpperCase() : ev.target.value } as Partial<Traveller>)} invalid={!!e} />;
    }
    return <Field key={k} label={label} error={e} required htmlFor={id}>{input}</Field>;
  };

  const yn = { yes: t.common.yes, no: t.common.no };
  const extracted = [
    [tf.firstNameEn, [tr.firstNameEn, tr.middleNameEn, tr.grandFatherNameEn, tr.familyNameEn].filter(Boolean).join(" ")],
    [tf.passportNo, tr.passportNo],
    [tf.birthDate, tr.birthDate],
    [tf.passportExpiryDate, tr.passportExpiryDate],
  ].filter(([, v]) => v);

  return (
    <div className="space-y-4">
      <Bubble>{fmt(d.askPassport, { name })}</Bubble>
      <div className="max-w-md ps-10">
        <PassportScanner
          value={tr.passportImage}
          onImage={(v) => update({ passportImage: v })}
          onParsed={(s) => {
            const patch = passportPatch(s, tr);
            filledCount.current = Object.keys(patch).length;
            update(patch);
          }}
          onDone={(read) => setScan({ read, n: read ? filledCount.current : 0 })}
          error={errText("passportImage")}
        />
      </div>
      {scan && <Bubble>{scan.read ? fmt(d.filled, { n: scan.n }) : d.notRead}</Bubble>}
      {scan?.read && extracted.length > 0 && (
        <dl className="ms-10 grid max-w-xl gap-x-4 gap-y-1 rounded-xl border border-slate-200 p-3 text-sm sm:grid-cols-2" aria-label={d.extracted}>
          {extracted.map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="font-semibold" dir="auto">{v}</dd></div>)}
        </dl>
      )}
      {tr.passportImage && (
        <>
          <Bubble>{fmt(d.askPhoto, { name })}</Bubble>
          <div className="max-w-xs ps-10"><PhotoUploader value={tr.personPhoto} onChange={(v) => update({ personPhoto: v })} error={errText("personPhoto")} /></div>
        </>
      )}
      {docsIn && asked.length > 0 && (
        <>
          <Bubble>{d.askMissing}</Bubble>
          <div className="grid gap-4 ps-10 sm:grid-cols-2" data-testid="guided-missing">{asked.map(field)}</div>
        </>
      )}
      {docsIn && (
        <>
          <Bubble>{d.declarations}</Bubble>
          <div className="space-y-3 ps-10">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-gold-50 p-3 text-sm font-medium ring-1 ring-gold-500/30">
              <input type="checkbox" className="mt-0.5 size-5 accent-brand-700" checked={allAnsweredNo} onChange={(e) => (e.target.checked ? allNo() : setShowQuestions(true))} data-testid="guided-all-no" />
              <span>{d.allNo}</span>
            </label>
            <button type="button" className="text-sm font-semibold text-brand-700 hover:underline" onClick={() => setShowQuestions((v) => !v)}>{d.showQuestions}</button>
            {showQuestions && (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3">
                {SECURITY_CLARIFIED.map((k) => (
                  <div key={k} className="py-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm">{t.travellers.security[k]}</p>
                      <YesNoInput name={`g${index}-${k}`} value={tr.security[k].answer} onChange={(v) => update({ security: { ...tr.security, [k]: { ...tr.security[k], answer: v } } })} labels={yn} invalid={!!errText(`security.${k}`)} />
                    </div>
                    {tr.security[k].answer === "true" && (
                      <Textarea className="mt-2" maxLength={2000} placeholder={t.travellers.security.clarification} value={tr.security[k].clarification} onChange={(ev) => update({ security: { ...tr.security, [k]: { ...tr.security[k], clarification: ev.target.value } } })} invalid={!!errText(`security.${k}`)} />
                    )}
                  </div>
                ))}
                {SECURITY_SIMPLE.map((k) => (
                  <div key={k} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm">{t.travellers.security[k]}</p>
                    <YesNoInput name={`g${index}-${k}`} value={tr.security[k]} onChange={(v: YesNo) => update({ security: { ...tr.security, [k]: v } })} labels={yn} invalid={!!errText(`security.${k}`)} />
                  </div>
                ))}
                {(["question1", "question2", "question3", "question4", "question5"] as const).map((k) => (
                  <div key={k} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm">{t.travellers.insurance[k]}</p>
                    <YesNoInput name={`g${index}-${k}`} value={tr.insurance[k] as YesNo | ""} onChange={(v) => update({ insurance: { ...tr.insurance, [k]: v } })} labels={yn} invalid={!!errText(`insurance.${k}`)} />
                  </div>
                ))}
                {(tr.insurance.question4 === "true" || tr.insurance.question5 === "true") && (
                  <div className="py-3"><Field label={t.travellers.insurance.question6} error={errText("insurance.question6")}><Input type="number" min={1} max={9} dir="ltr" value={tr.insurance.question6 === "0" ? "" : tr.insurance.question6} onChange={(ev) => update({ insurance: { ...tr.insurance, question6: ev.target.value } })} /></Field></div>
                )}
              </div>
            )}
          </div>
        </>
      )}
      {done && (
        <div className="space-y-3">
          <Bubble from="system">{fmt(d.done, { name })}</Bubble>
          {booking.travellers.length > 1 && <div className="ps-10"><Button size="sm" onClick={onNext}>{d.next}</Button></div>}
        </div>
      )}
      <div className="ps-10">
        <button type="button" className="text-xs font-semibold text-slate-600 hover:underline" onClick={() => setShowAll((v) => !v)}>{showAll ? d.hideAll : d.editAll}</button>
      </div>
      {showAll && <TravellerForm index={index} traveller={tr} all={booking.travellers} errors={errs} showErrors onChange={update} />}
    </div>
  );
}
