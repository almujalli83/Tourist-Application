import { notFound, redirect } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { PrintButton } from "@/components/print-button";
import { fmt, getDictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { currentUser } from "@/lib/auth/session";
import { getBooking } from "@/lib/bookings/service";
import { cityName } from "@/lib/data/cities";
import { passportKey } from "@/lib/saved-travellers-repo";

/** Printable trip documents generated from the booking: summary, e-tickets, vouchers, activity tickets. */
export default async function BookingDocumentsPage({ params, searchParams }: {
  params: Promise<{ locale: string; bookingId: string }>;
  searchParams: Promise<{ person?: string }>;
}) {
  const { locale: l, bookingId } = await params;
  const locale = (l === "en" ? "en" : "ar") as Locale;
  const user = await currentUser();
  if (!user) redirect(`/${locale}/login?next=/${locale}/account/wallet`);
  const b = await getBooking(user.id, bookingId);
  if (!b) notFound();
  const t = getDictionary(locale);
  const d = t.wallet.doc;
  const { person } = await searchParams;
  const passengers = b.applicants.filter((a) => !person || passportKey(a) === person);
  const arrow = locale === "ar" ? "←" : "→";
  const block = "break-inside-avoid rounded-2xl border border-slate-300 bg-white p-5 print:rounded-none print:border-slate-400";
  const kv = (k: string, v: string) => (
    <div><dt className="text-xs text-slate-500">{k}</dt><dd className="ltr-nums font-semibold">{v}</dd></div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-8 sm:px-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <BackLink href={`/${locale}/account/wallet`} label={t.wallet.title} className="-ms-2.5" />
        <PrintButton label={t.wallet.print} />
      </div>

      <section className={block}>
        <h1 className="text-xl font-bold">{d.summary}</h1>
        <dl className="mt-3 grid gap-3 sm:grid-cols-4">
          {kv(t.confirmation.bookingRef, b.reference)}
          {kv(t.confirmation.packageId, b.mt.packageId ?? "—")}
          {kv(d.dates, `${b.criteria.departureDate} → ${b.criteria.returnDate}`)}
          {kv(t.common.travellers, String(b.applicants.length))}
        </dl>
        <ul className="mt-3 space-y-1 text-sm">
          {passengers.map((a) => (
            <li key={a.applicationNo} className="ltr-nums"><span dir="ltr" className="font-semibold">{a.nameEn}</span> · {a.passportNo} · {t.confirmation.visaNumber}: {a.visaNumber ?? "—"}</li>
          ))}
        </ul>
      </section>

      {b.flights.map((f, i) => (
        <section key={f.id} className={block}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold">✈ {d.eticket}</h2>
            <span className="text-xs text-slate-500">{d.agent}: {locale === "ar" ? f.agentNameAr : f.agentNameEn}</span>
          </div>
          <dl className="mt-3 grid gap-3 sm:grid-cols-4">
            {kv(d.ticketNo, b.ticketNos?.[i] ?? "—")}
            {kv(d.flight, `${f.flightNo} · ${locale === "ar" ? f.carrierNameAr : f.carrierNameEn}`)}
            {kv(d.departure, `${cityName(f.from, locale)} ${f.departAt.replace("T", " ")}`)}
            {kv(d.arrival, `${cityName(f.to, locale)} ${f.arriveAt.replace("T", " ")}`)}
          </dl>
          <p className="mt-2 text-sm">{d.passenger}: <span dir="ltr" className="font-semibold">{passengers.map((a) => a.nameEn).join(", ")}</span> · {t.search.cabins[f.cabin]} · {f.baggageKg} kg</p>
          <p className="mt-1 text-sm">{cityName(f.from, locale)} {arrow} {cityName(f.to, locale)}</p>
        </section>
      ))}

      {b.hotels.map((h, i) => (
        <section key={h.id} className={block}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold">🏨 {d.hotelVoucher}</h2>
            <span className="text-xs text-slate-500">{d.agent}: {locale === "ar" ? h.agentNameAr : h.agentNameEn}</span>
          </div>
          <p className="mt-2 font-semibold">{locale === "ar" ? h.nameAr : h.nameEn} — {cityName(h.city, locale)} ({"★".repeat(h.stars)})</p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-4">
            {kv(d.confirmation, `${b.reference}-H${i + 1}`)}
            {kv(d.license, h.licenseNo)}
            {kv(d.checkIn, h.checkIn)}
            {kv(d.checkOut, h.checkOut)}
            {kv(d.rooms, `${h.rooms} · ${locale === "ar" ? h.roomTypeAr : h.roomTypeEn}`)}
          </dl>
          <p className="mt-2 text-sm">{d.passenger}: <span dir="ltr" className="font-semibold">{passengers.map((a) => a.nameEn).join(", ")}</span></p>
        </section>
      ))}

      {b.activities.map((a, i) => (
        <section key={a.id} className={block}>
          <h2 className="font-bold">🎟 {d.activityTicket}</h2>
          <p className="mt-2 font-semibold">{locale === "ar" ? a.titleAr : a.titleEn} — {locale === "ar" ? a.venueAr : a.venueEn}, {cityName(a.city, locale)}</p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-4">
            {kv(d.confirmation, `${b.reference}-A${i + 1}`)}
            {kv(t.common.date, `${a.date} ${a.timeFrom}–${a.timeTo}`)}
            {kv(d.tickets, String(a.partySize))}
            {kv(d.agent, locale === "ar" ? a.agentNameAr : a.agentNameEn)}
          </dl>
        </section>
      ))}

      <p className="text-center text-xs text-slate-500">{fmt(d.issuedBy, { ref: b.reference })}</p>
    </div>
  );
}
