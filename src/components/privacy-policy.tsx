"use client";

import Link from "next/link";
import { fmt } from "@/i18n";
import { useApp } from "./app-provider";
import { CheckIcon, ShieldIcon } from "./icons";
import { Card } from "./ui";

export interface PrivacyFacts {
  version: string;
  residency: "ksa" | "open";
  contact: string | null;
  retention: { key: string; days: number }[];
}

const COOKIES = ["ta_session", "ta_locale", "ta_ui", "ta_currency", "ta_oauth"] as const;

/** The privacy notice (PDPL art. 12–13). Retention periods and residency come from the running configuration. */
export function PrivacyPolicy({ facts }: { facts: PrivacyFacts }) {
  const { t, locale } = useApp();
  const p = t.privacy;
  const rows = p.retention.rows as Record<string, string>;
  const list = (items: readonly string[]) => (
    <ul className="space-y-2 text-sm text-slate-700">{items.map((f) => <li key={f} className="flex gap-2"><CheckIcon className="mt-0.5 size-4 shrink-0 text-brand-700" />{f}</li>)}</ul>
  );
  const sections = [
    { id: "who", title: p.who.title, body: (
      <p className="text-sm text-slate-700">
        {facts.contact
          ? fmt(p.who.text, { contact: facts.contact })
          : <>{p.who.text.split("{contact}")[0]}<Link href={`/${locale}/support`} className="font-semibold text-brand-700 underline">{p.who.supportLink}</Link>{p.who.text.split("{contact}")[1]}</>}
      </p>
    ) },
    { id: "collect", title: p.collect.title, body: list(p.collect.items) },
    { id: "purposes", title: p.purposes.title, body: list(p.purposes.items) },
    { id: "sharing", title: p.sharing.title, body: <>{list(p.sharing.items)}<p className="text-sm font-semibold text-slate-800">{p.sharing.noSale}</p></> },
    { id: "location", title: p.location.title, body: <p className="text-sm text-slate-700">{facts.residency === "ksa" ? p.location.ksa : p.location.open}</p> },
    { id: "retention", title: p.retention.title, body: (
      <>
        <p className="text-sm text-slate-700">{p.retention.intro}</p>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {facts.retention.filter((r) => rows[r.key]).map((r) => (
              <tr key={r.key}><th scope="row" className="py-2 pe-3 text-start font-medium text-slate-800">{rows[r.key]}</th><td className="py-2 text-slate-700">{fmt(p.retention.after, { n: r.days })}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm text-slate-700">{p.retention.account}</p>
        <p className="text-sm text-slate-700">{p.retention.bookings}</p>
      </>
    ) },
    { id: "security", title: p.security.title, body: list(p.security.items) },
    { id: "rights", title: p.rights.title, body: (
      <>
        {list(p.rights.items)}
        <p className="text-sm text-slate-700">{p.rights.exercise} <Link href={`/${locale}/account/security`} className="font-semibold text-brand-700 underline">{p.rights.exerciseLink}</Link></p>
        <p className="text-sm text-slate-700">{p.rights.complaint}</p>
      </>
    ) },
    { id: "cookies", title: p.cookies.title, body: (
      <>
        <p className="text-sm text-slate-700">{p.cookies.intro}</p>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {COOKIES.map((c) => <tr key={c}><th scope="row" className="py-2 pe-3 text-start font-mono text-xs text-slate-800" dir="ltr">{c}</th><td className="py-2 text-slate-700">{p.cookies.rows[c]}</td></tr>)}
          </tbody>
        </table>
        <p className="text-sm text-slate-700">{p.cookies.local}</p>
      </>
    ) },
    { id: "children", title: p.children.title, body: <p className="text-sm text-slate-700">{p.children.text}</p> },
    { id: "changes", title: p.changes.title, body: <p className="text-sm text-slate-700">{p.changes.text}</p> },
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-ink"><ShieldIcon className="size-7 text-brand-700" />{p.title}</h1>
      <p className="text-xs font-semibold text-slate-500">{fmt(p.version, { version: facts.version })}</p>
      <p className="text-slate-700">{p.intro}</p>
      <nav aria-label={p.contents}>
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {sections.map((s) => <li key={s.id}><a href={`#${s.id}`} className="text-brand-700 underline">{s.title}</a></li>)}
        </ol>
      </nav>
      {sections.map((s) => (
        <Card key={s.id} className="space-y-3 p-5">
          <h2 id={s.id} className="scroll-mt-24 font-bold">{s.title}</h2>
          {s.body}
        </Card>
      ))}
    </div>
  );
}
