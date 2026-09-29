"use client";

import { suggestEmail } from "@/lib/email-check";
import type { Traveller } from "@/lib/types";
import { useApp } from "../app-provider";
import { PhoneInput, phoneHint } from "../phone-input";
import { Field, Input } from "../ui";

/**
 * A traveller's email and mobile, as every visa form asks for them: the eVisa and insurance policy
 * go to the email, trip notices to the mobile. Both are checked as they are typed (format, a mistyped
 * email domain, the mobile's length for its country) and again on the server.
 */
export function ContactFields({ idPrefix, traveller, error, onChange }: {
  idPrefix: string;
  traveller: Pick<Traveller, "email" | "mobileNo" | "nationality">;
  error: (key: "email" | "mobileNo") => string | undefined;
  onChange: (patch: Partial<Traveller>) => void;
}) {
  const { t } = useApp();
  const tf = t.travellers.fields;
  const suggestion = suggestEmail(traveller.email);
  return (
    <>
      <Field label={tf.email} required error={error("email")} hint={tf.emailHint} htmlFor={`${idPrefix}-email`}>
        <Input id={`${idPrefix}-email`} type="email" dir="ltr" autoComplete="email" maxLength={50} value={traveller.email}
          onChange={(ev) => onChange({ email: ev.target.value })} invalid={!!error("email")} />
        {suggestion && (
          <p className="text-xs font-medium text-amber-800" role="status" data-testid={`${idPrefix}-email-suggestion`}>
            {tf.emailDidYouMean}{" "}
            <button type="button" dir="ltr" className="font-semibold text-brand-700 underline" onClick={() => onChange({ email: suggestion })}>{suggestion}</button>
            {tf.emailDidYouMeanEnd}
          </p>
        )}
      </Field>
      <Field label={tf.mobileNo} required error={error("mobileNo")} hint={phoneHint(traveller.mobileNo, traveller.nationality, tf.mobileLength)} htmlFor={`${idPrefix}-mobileNo`}>
        <PhoneInput id={`${idPrefix}-mobileNo`} value={traveller.mobileNo} defaultCountry={traveller.nationality} onChange={(v) => onChange({ mobileNo: v })} invalid={!!error("mobileNo")} />
      </Field>
    </>
  );
}
