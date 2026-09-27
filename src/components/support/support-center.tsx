"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LANGUAGES, type Lang } from "@/lib/assistant/translate";
import type { StoredBooking } from "@/lib/bookings/types";
import { fmtKsa } from "@/lib/events/format";
import { FAQS } from "@/lib/support/faq";
import { MAX_SUBJECT, SUPPORT_CATEGORIES, type PublicTicket, type SupportCategory } from "@/lib/support/types";
import { useApp } from "../app-provider";
import { ChatIcon, ChevronIcon, PhoneIcon, SearchIcon } from "../icons";
import { Alert, Badge, Card, cx, Field, Input, Select, Spinner } from "../ui";
import { SupportComplaintCard } from "./complaint-card";
import { Composer, type Attachment } from "./conversation";

export const STATUS_TONE = { open: "amber", waiting: "brand", closed: "slate" } as const;

/** Service 13 — support centre: FAQ first, then a ticket in the traveller's language. */
export function SupportCenter() {
  const { t, locale, user } = useApp();
  const s = t.support;
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<SupportCategory | "">("");
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [tickets, setTickets] = useState<PublicTicket[] | null>(null);
  const [bookings, setBookings] = useState<StoredBooking[]>([]);
  const [cfg, setCfg] = useState<{ whatsapp: string | null } | null>(null);
  const [form, setForm] = useState({ subject: "", category: "other" as SupportCategory, bookingId: "", lang: (locale === "ar" ? "ar" : "en") as Lang });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/support/config").then((r) => r.json()).then(setCfg).catch(() => undefined);
    if (!user) return;
    fetch("/api/support/tickets", { cache: "no-store" }).then((r) => r.json()).then((d) => setTickets(d.tickets ?? [])).catch(() => setTickets([]));
    fetch("/api/bookings").then((r) => (r.ok ? r.json() : { bookings: [] })).then((d) => {
      setBookings(d.bookings ?? []);
      // From a booking page: ?booking=<id> links the new ticket to it.
      const wanted = new URLSearchParams(window.location.search).get("booking");
      if (wanted && (d.bookings ?? []).some((b: StoredBooking) => b.id === wanted)) {
        setForm((f) => ({ ...f, bookingId: wanted, category: "booking" }));
        document.getElementById("new-ticket")?.scrollIntoView({ behavior: "smooth" });
      }
    }).catch(() => undefined);
  }, [user]);

  const faqs = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return FAQS.filter((f) => (!cat || f.category === cat) && (!needle || `${f.qAr} ${f.qEn} ${f.aAr} ${f.aEn}`.toLowerCase().includes(needle)));
  }, [q, cat]);

  async function open(message: string, attachments: Attachment[]): Promise<boolean> {
    if (!form.subject.trim()) {
      setErr(s.errors.subject);
      return false;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, bookingId: form.bookingId || undefined, message, attachments }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((s.errors as Record<string, string>)[d.error] ?? s.errors.generic);
        return false;
      }
      router.push(`/${locale}/support/${d.ticket.id}`);
      return true;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{s.title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">{s.intro}</p>
        </div>
        {cfg?.whatsapp && (
          <a href={`https://wa.me/${cfg.whatsapp}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#1f9d55] px-4 text-sm font-semibold text-white" data-testid="support-whatsapp">
            <PhoneIcon className="size-4" />{s.whatsapp}
          </a>
        )}
      </div>

      <Card className="p-5" data-testid="faq">
        <h2 className="font-bold">{s.faqTitle}</h2>
        <div className="relative mt-3">
          <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={s.faqSearch} aria-label={s.faqSearch} className="ps-9" data-testid="faq-search" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["", ...SUPPORT_CATEGORIES.filter((c) => FAQS.some((f) => f.category === c))] as const).map((c) => (
            <button key={c || "all"} type="button" onClick={() => setCat(c as SupportCategory | "")} aria-pressed={cat === c}
              className={cx("h-8 rounded-full px-3 text-xs font-semibold", cat === c ? "bg-brand-800 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50")}>
              {c ? s.categories[c] : t.reviews.all}
            </button>
          ))}
        </div>
        <ul className="mt-3 divide-y divide-slate-100">
          {faqs.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => setOpenFaq(openFaq === f.id ? null : f.id)} aria-expanded={openFaq === f.id} className="flex w-full items-center justify-between gap-3 py-3 text-start text-sm font-semibold text-ink" data-testid="faq-q">
                {locale === "ar" ? f.qAr : f.qEn}
                <ChevronIcon className={cx("size-4 shrink-0 transition-transform", openFaq === f.id ? "-rotate-90" : "rotate-90")} />
              </button>
              {openFaq === f.id && <p className="pb-3 text-sm leading-6 text-slate-600" data-testid="faq-a">{locale === "ar" ? f.aAr : f.aEn}</p>}
            </li>
          ))}
          {faqs.length === 0 && <li className="py-3 text-sm text-slate-500">{s.faqNone}</li>}
        </ul>
      </Card>

      <Card className="p-5" data-testid="new-ticket" id="new-ticket">
        <h2 className="flex items-center gap-2 font-bold"><ChatIcon className="size-5 text-brand-700" />{s.notAnswered} {s.open}</h2>
        {!user ? (
          <p className="mt-3 text-sm">
            <Link href={`/${locale}/login?next=/${locale}/support`} className="font-semibold text-brand-700 underline">{s.signIn}</Link>
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={s.subject} required>
                <Input value={form.subject} maxLength={MAX_SUBJECT} onChange={(e) => setForm({ ...form, subject: e.target.value })} dir="auto" data-testid="ticket-subject" />
              </Field>
              <Field label={s.category}>
                <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as SupportCategory })} data-testid="ticket-category">
                  {SUPPORT_CATEGORIES.map((c) => <option key={c} value={c}>{s.categories[c]}</option>)}
                </Select>
              </Field>
              <Field label={s.booking}>
                <Select value={form.bookingId} onChange={(e) => setForm({ ...form, bookingId: e.target.value })} data-testid="ticket-booking">
                  <option value="">{s.noBooking}</option>
                  {bookings.map((b) => <option key={b.id} value={b.id}>{b.reference} · {b.criteria.departureDate}</option>)}
                </Select>
              </Field>
              <Field label={s.language} hint={s.messageHint}>
                <Select value={form.lang} onChange={(e) => setForm({ ...form, lang: e.target.value as Lang })} data-testid="ticket-lang">
                  {LANGUAGES.map((l) => <option key={l} value={l}>{t.translate.languages[l]}</option>)}
                </Select>
              </Field>
            </div>
            {form.category === "complaint" && <SupportComplaintCard />}
            {err && <Alert tone="error">{err}</Alert>}
            <Composer onSend={(m, a) => open(m, a)} placeholder={s.message} busy={busy} testId="ticket-composer" />
          </div>
        )}
      </Card>

      {user && (
        <Card className="p-5" data-testid="my-tickets">
          <h2 className="font-bold">{s.myTickets}</h2>
          {!tickets ? (
            <div className="grid h-20 place-items-center text-brand-700"><Spinner className="size-6" /></div>
          ) : tickets.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{s.noTickets}</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {tickets.map((tk) => (
                <li key={tk.id}>
                  <Link href={`/${locale}/support/${tk.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-slate-50" data-testid="ticket-row">
                    <span className="min-w-0">
                      <span className="block text-xs text-slate-500"><span className="ltr-nums">{tk.number}</span> · {s.categories[tk.category]} · {fmtKsa(tk.updatedAt, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="block truncate font-semibold text-ink" dir="auto">{tk.subject}</span>
                    </span>
                    <span className="flex gap-1.5">
                      {tk.demo && <Badge>{s.sample}</Badge>}
                      <Badge tone={STATUS_TONE[tk.status]}>{s.status[tk.status]}</Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
