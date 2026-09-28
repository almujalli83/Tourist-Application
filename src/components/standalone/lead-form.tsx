"use client";

import { useEffect, useState } from "react";
import { EMAIL_RE } from "@/lib/auth/validation";
import { validatePhone } from "@/lib/phone";
import { useApp } from "../app-provider";
import { PhoneInput } from "../phone-input";
import { Field, Input, Textarea } from "../ui";

export interface Lead { name: string; email: string; phone: string }

/** The lead guest (prefilled from the account) and special requests, checked with the server's rules. */
export function useLeadForm() {
  const { t, user } = useApp();
  const s = t.standalone;
  const [lead, setLead] = useState<Lead>({ name: "", email: "", phone: "" });
  const [requests, setRequests] = useState("");
  useEffect(() => {
    if (user) setLead((l) => ({ name: l.name || user.individual?.fullName || user.company?.contactPerson || "", email: l.email || user.email, phone: l.phone || user.individual?.phone || user.company?.phone || "" }));
  }, [user]);
  // The same rules as the server, shown under each field so a disabled button is never a mystery.
  const errors = {
    name: lead.name.trim().replace(/\s+/g, " ").includes(" ") ? undefined : s.errors.leadName,
    email: EMAIL_RE.test(lead.email.trim()) ? undefined : s.errors.email,
    phone: validatePhone(lead.phone) ? s.errors.phone : undefined,
  };
  return { lead, setLead, requests, setRequests, errors, ok: !errors.name && !errors.email && !errors.phone };
}

export function LeadFields({ form }: { form: ReturnType<typeof useLeadForm> }) {
  const { t, user } = useApp();
  const h = t.standalone.hotels;
  const { lead, setLead, requests, setRequests, errors } = form;
  const shown = (k: keyof Lead) => (lead[k].trim() ? errors[k] : undefined);
  return (
    <>
      <Field label={h.leadName} required error={shown("name")} htmlFor="st-lead-name"><Input id="st-lead-name" value={lead.name} onChange={(e) => setLead({ ...lead, name: e.target.value })} autoComplete="name" data-testid="st-lead-name" /></Field>
      <Field label={h.email} required error={shown("email")} htmlFor="st-lead-email"><Input id="st-lead-email" data-testid="st-lead-email" type="email" dir="ltr" value={lead.email} onChange={(e) => setLead({ ...lead, email: e.target.value })} autoComplete="email" /></Field>
      <Field label={h.phone} required error={shown("phone")} htmlFor="st-lead-phone"><PhoneInput id="st-lead-phone" value={lead.phone} onChange={(phone) => setLead({ ...lead, phone })} defaultCountry={user?.individual?.nationality || "SA"} invalid={!!shown("phone")} testId="st-lead-phone" /></Field>
      <Field label={h.requests} hint={h.requestsHint} htmlFor="st-req"><Textarea id="st-req" rows={2} value={requests} maxLength={500} onChange={(e) => setRequests(e.target.value)} /></Field>
    </>
  );
}
