"use client";

import type { ReactNode } from "react";
import { isArabCountry } from "@/lib/data/countries";
import { COMPANION_TYPES } from "@/lib/mt-evisa/lookups";
import type { ClarifiedAnswer, Traveller, YesNo } from "@/lib/types";
import { SECURITY_CLARIFIED, SECURITY_SIMPLE, type FieldErrors } from "@/lib/visa-validation";
import { useApp } from "../app-provider";
import { PhoneInput, phoneHint } from "../phone-input";
import { HeartPulseIcon, PassportIcon, ShieldIcon, UserIcon, UsersIcon } from "../icons";
import { Card, Field, Input, SectionTitle, Select, Textarea, YesNo as YesNoInput } from "../ui";
import { CountrySelect } from "./country-select";
import { PassportScanner, type PassportScan } from "./passport-scanner";
import { PhotoUploader } from "./photo-uploader";

type Props = {
  index: number;
  traveller: Traveller;
  all: Traveller[];
  errors: FieldErrors;
  showErrors: boolean;
  onChange: (patch: Partial<Traveller>) => void;
  /** "profile" edits a saved traveller: trip-specific sections are hidden. */
  mode?: "booking" | "profile";
};

function Section({ title, icon, children, subtitle }: { title: string; icon: ReactNode; children: ReactNode; subtitle?: string }) {
  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle title={title} icon={icon} subtitle={subtitle} />
      <div className="mt-5">{children}</div>
    </Card>
  );
}

export function TravellerForm({ index, traveller: tr, all, errors, showErrors, onChange, mode = "booking" }: Props) {
  const booking = mode === "booking";
  const { t, locale } = useApp();
  const tf = t.travellers.fields;
  const e = (k: string) => (showErrors && errors[k] ? t.travellers.errors[errors[k] as keyof typeof t.travellers.errors] ?? errors[k] : undefined);
  const arab = isArabCountry(tr.nationality);

  function text(key: keyof Traveller, opts: { required?: boolean; dir?: "ltr" | "rtl"; upper?: boolean; hint?: string; type?: string; max?: number } = {}) {
    const id = `t${index}-${String(key)}`;
    return (
      <Field label={tf[key as keyof typeof tf] as string} required={opts.required} error={e(String(key))} hint={opts.hint} htmlFor={id}>
        <Input
          id={id}
          type={opts.type ?? "text"}
          dir={opts.dir}
          maxLength={opts.max}
          value={String(tr[key] ?? "")}
          onChange={(ev) => onChange({ [key]: opts.upper ? ev.target.value.toUpperCase() : ev.target.value } as Partial<Traveller>)}
          invalid={!!e(String(key))}
        />
      </Field>
    );
  }

  function applyMrz({ mrz: r, issueDate, arabicName }: PassportScan) {
    const patch: Partial<Traveller> = {};
    const clip = (s: string) => s.slice(0, 15);
    if (r.familyName) patch.familyNameEn = clip(r.familyName);
    if (r.givenNames[0]) patch.firstNameEn = clip(r.givenNames[0]);
    if (r.givenNames[1]) patch.middleNameEn = clip(r.givenNames[1]);
    if (r.givenNames.length > 2) patch.grandFatherNameEn = clip(r.givenNames.slice(2).join(" "));
    if (r.passportNo && r.valid.passportNo) patch.passportNo = r.passportNo;
    if (r.birthDate && r.valid.birthDate) patch.birthDate = r.birthDate;
    if (r.expiryDate && r.valid.expiryDate) patch.passportExpiryDate = r.expiryDate;
    if (r.gender) patch.gender = r.gender;
    if (/^[A-Z]{2}$/.test(r.nationality)) {
      patch.nationality = r.nationality;
      // Country of birth is not in the MRZ; replace it only while it still holds the search default.
      if (!tr.birthplace || tr.birthplace === tr.nationality) patch.birthplace = r.nationality;
    }
    if (issueDate && !tr.passportIssueDate) patch.passportIssueDate = issueDate;
    if (arabicName) {
      // Fill only empty fields so manual corrections are never overwritten.
      for (const k of ["firstNameAr", "middleNameAr", "grandFatherNameAr", "familyNameAr"] as const) {
        if (arabicName[k] && !tr[k]) patch[k] = arabicName[k];
      }
    }
    if (/^[A-Z]{2}$/.test(r.issuingCountry)) patch.passportIssuePlace = r.issuingCountry;
    onChange(patch);
  }

  const setSecurity = (k: (typeof SECURITY_CLARIFIED)[number], v: Partial<ClarifiedAnswer>) =>
    onChange({ security: { ...tr.security, [k]: { ...tr.security[k], ...v } } });
  const setSimple = (k: (typeof SECURITY_SIMPLE)[number], v: YesNo) => onChange({ security: { ...tr.security, [k]: v } });
  const setIns = (k: keyof Traveller["insurance"], v: string) => onChange({ insurance: { ...tr.insurance, [k]: v } });
  const yn = { yes: t.common.yes, no: t.common.no };
  const sponsors = all.map((o, i) => ({ o, i })).filter(({ o, i }) => i !== index && o.paxType === "adult" && o.sponsorIndex === null);
  const nameOf = (o: Traveller, i: number) => [o.firstNameEn, o.familyNameEn].filter(Boolean).join(" ") || t.travellers.travellerN.replace("{n}", String(i + 1));

  return (
    <div className="space-y-4">
      <Section title={t.travellers.sections.documents} icon={<PassportIcon className="size-5" />}>
        <div className="grid gap-6 md:grid-cols-2">
          <PassportScanner value={tr.passportImage} onImage={(v) => onChange({ passportImage: v })} onParsed={applyMrz} error={e("passportImage")} />
          <PhotoUploader value={tr.personPhoto} onChange={(v) => onChange({ personPhoto: v })} error={e("personPhoto")} />
        </div>
      </Section>

      <Section title={t.travellers.sections.personal} icon={<UserIcon className="size-5" />}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {text("firstNameEn", { required: true, dir: "ltr", upper: true, max: 15 })}
          {text("middleNameEn", { dir: "ltr", upper: true, max: 15 })}
          {text("grandFatherNameEn", { dir: "ltr", upper: true, max: 15 })}
          {text("familyNameEn", { required: true, dir: "ltr", upper: true, max: 15 })}
          {arab && (
            <>
              {text("firstNameAr", { required: true, dir: "rtl", max: 15 })}
              {text("middleNameAr", { dir: "rtl", max: 15 })}
              {text("grandFatherNameAr", { dir: "rtl", max: 15 })}
              {text("familyNameAr", { required: true, dir: "rtl", max: 15 })}
            </>
          )}
        </div>
        {arab && <p className="mt-2 text-xs text-gold-700">{t.travellers.arabicRequired}</p>}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {text("birthDate", { required: true, type: "date" })}
          <Field label={tf.birthplace} required error={e("birthplace")}>
            <CountrySelect value={tr.birthplace} onChange={(v) => onChange({ birthplace: v })} invalid={!!e("birthplace")} />
          </Field>
          <Field label={tf.nationality} required error={e("nationality")}>
            <CountrySelect value={tr.nationality} onChange={(v) => onChange({ nationality: v })} invalid={!!e("nationality")} />
          </Field>
          <Field label={tf.gender} required error={e("gender")}>
            <Select value={tr.gender} onChange={(ev) => onChange({ gender: ev.target.value as Traveller["gender"] })} invalid={!!e("gender")}>
              <option value="">—</option>
              <option value="1">{t.travellers.genders["1"]}</option>
              <option value="2">{t.travellers.genders["2"]}</option>
            </Select>
          </Field>
          <Field label={tf.religion} required error={e("religion")}>
            <Select value={tr.religion} onChange={(ev) => onChange({ religion: ev.target.value as Traveller["religion"] })} invalid={!!e("religion")}>
              <option value="">—</option>
              <option value="1">{t.travellers.religions["1"]}</option>
              <option value="2">{t.travellers.religions["2"]}</option>
            </Select>
          </Field>
          <Field label={tf.maritalStatus} required error={e("maritalStatus")}>
            <Select value={tr.maritalStatus} onChange={(ev) => onChange({ maritalStatus: ev.target.value as Traveller["maritalStatus"] })} invalid={!!e("maritalStatus")}>
              <option value="">—</option>
              {(["1", "2", "3", "4", "5"] as const).map((k) => <option key={k} value={k}>{t.travellers.marital[k]}</option>)}
            </Select>
          </Field>
          <div className="sm:col-span-2">{text("job", { required: true, max: 20 })}</div>
        </div>
      </Section>

      <Section title={t.travellers.sections.passport} icon={<PassportIcon className="size-5" />}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {text("passportNo", { required: true, dir: "ltr", upper: true, max: 12 })}
          <Field label={tf.passportType} required error={e("passportType")}>
            <Select value={tr.passportType} onChange={(ev) => onChange({ passportType: ev.target.value as Traveller["passportType"] })}>
              {(["1", "2", "3"] as const).map((k) => <option key={k} value={k}>{t.travellers.passportTypes[k]}</option>)}
            </Select>
          </Field>
          <Field label={tf.passportIssuePlace} required error={e("passportIssuePlace")}>
            <CountrySelect value={tr.passportIssuePlace} onChange={(v) => onChange({ passportIssuePlace: v })} invalid={!!e("passportIssuePlace")} />
          </Field>
          {text("passportIssueDate", { required: true, type: "date" })}
          {text("passportExpiryDate", { required: true, type: "date" })}
        </div>
      </Section>

      <Section title={t.travellers.sections.contact} icon={<UserIcon className="size-5" />}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {text("email", { required: true, dir: "ltr", type: "email", hint: tf.emailHint, max: 50 })}
          <Field label={tf.mobileNo} required error={e("mobileNo")} hint={phoneHint(tr.mobileNo, tr.nationality, tf.mobileLength)} htmlFor={`t${index}-mobileNo`}>
            <PhoneInput id={`t${index}-mobileNo`} value={tr.mobileNo} defaultCountry={tr.nationality} onChange={(v) => onChange({ mobileNo: v })} invalid={!!e("mobileNo")} />
          </Field>
          {text("zipCode", { dir: "ltr", max: 15 })}
        </div>
        {booking && index > 0 && (
          <button type="button" className="mt-3 text-sm font-semibold text-brand-700 hover:underline" onClick={() => onChange({ email: all[0].email, mobileNo: all[0].mobileNo, zipCode: all[0].zipCode })}>
            {t.travellers.copyContact}
          </button>
        )}
      </Section>

      {booking && (
        <>
          <Section title={t.travellers.sections.companion} icon={<UsersIcon className="size-5" />}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tf.sponsor} error={e("sponsorIndex")}>
                <Select
                  value={tr.sponsorIndex === null ? "" : String(tr.sponsorIndex)}
                  onChange={(ev) => onChange({ sponsorIndex: ev.target.value === "" ? null : Number(ev.target.value) })}
                  invalid={!!e("sponsorIndex")}
                >
                  <option value="">{tf.noSponsor}</option>
                  {sponsors.map(({ o, i }) => <option key={i} value={i}>{nameOf(o, i)}</option>)}
                </Select>
              </Field>
              {tr.sponsorIndex !== null && (
                <Field label={tf.companionType} required error={e("companionType")}>
                  <Select value={tr.companionType} onChange={(ev) => onChange({ companionType: ev.target.value })} invalid={!!e("companionType")}>
                    <option value="">—</option>
                    {COMPANION_TYPES.map((c) => <option key={c.code} value={c.code}>{c[locale]}</option>)}
                  </Select>
                </Field>
              )}
            </div>
          </Section>

          <Section title={t.travellers.sections.security} icon={<ShieldIcon className="size-5" />} subtitle={t.travellers.security.intro}>
            <div className="divide-y divide-slate-100">
              {SECURITY_CLARIFIED.map((k) => (
                <div key={k} className="py-3 first:pt-0">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-slate-800">{t.travellers.security[k]}</p>
                    <YesNoInput name={`t${index}-${k}`} value={tr.security[k].answer} onChange={(v) => setSecurity(k, { answer: v })} labels={yn} invalid={!!e(`security.${k}`)} />
                  </div>
                  {tr.security[k].answer === "true" && (
                    <Textarea
                      className="mt-2"
                      maxLength={2000}
                      placeholder={`${t.travellers.security.clarification}: ${t.travellers.security.clarificationHints[k]}`}
                      value={tr.security[k].clarification}
                      onChange={(ev) => setSecurity(k, { clarification: ev.target.value })}
                      invalid={!!e(`security.${k}`)}
                    />
                  )}
                  {e(`security.${k}`) && <p className="mt-1 text-xs font-medium text-red-600">{e(`security.${k}`)}</p>}
                </div>
              ))}
              {SECURITY_SIMPLE.map((k) => (
                <div key={k} className="py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-slate-800">{t.travellers.security[k]}</p>
                    <YesNoInput name={`t${index}-${k}`} value={tr.security[k]} onChange={(v) => setSimple(k, v)} labels={yn} invalid={!!e(`security.${k}`)} />
                  </div>
                  {e(`security.${k}`) && <p className="mt-1 text-xs font-medium text-red-600">{e(`security.${k}`)}</p>}
                </div>
              ))}
            </div>
          </Section>

          <Section title={t.travellers.sections.insurance} icon={<HeartPulseIcon className="size-5" />} subtitle={t.travellers.insurance.intro}>
            <div className="divide-y divide-slate-100">
              {/* All six insurance questions of the MT guide (§2.4); 4–5 are optional, 6 depends on them. */}
              {(["question1", "question2", "question3", "question4", "question5"] as const).map((k, i) => (
                <div key={k} className="py-3 first:pt-0">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-slate-800">
                      <span className="me-1 font-semibold text-brand-700">{i + 1}.</span>
                      {t.travellers.insurance[k]}
                      {(k === "question4" || k === "question5") && <span className="ms-1 text-xs text-slate-400">({t.common.optional})</span>}
                    </p>
                    <YesNoInput name={`t${index}-${k}`} value={tr.insurance[k] as YesNo | ""} onChange={(v) => setIns(k, v)} labels={yn} invalid={!!e(`insurance.${k}`)} />
                  </div>
                  {e(`insurance.${k}`) && <p className="mt-1 text-xs font-medium text-red-600">{e(`insurance.${k}`)}</p>}
                </div>
              ))}
              {(() => {
                const pregnant = tr.insurance.question4 === "true" || tr.insurance.question5 === "true";
                return (
                  <div className="py-3">
                    <Field
                      label={`6. ${t.travellers.insurance.question6}`}
                      required={pregnant}
                      hint={pregnant ? undefined : t.travellers.insurance.question6Hint}
                      error={e("insurance.question6")}
                    >
                      <Input
                        type="number"
                        min={0}
                        max={9}
                        className="max-w-28"
                        value={pregnant ? tr.insurance.question6 : "0"}
                        disabled={!pregnant}
                        onChange={(ev) => setIns("question6", ev.target.value)}
                        invalid={!!e("insurance.question6")}
                      />
                    </Field>
                  </div>
                );
              })()}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
