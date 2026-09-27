"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { fmt } from "@/i18n";
import { cityName } from "@/lib/data/cities";
import type { EsimOrder } from "@/lib/esim/orders";
import type { GuideBooking } from "@/lib/guides/bookings";
import type { PublicTransfer } from "@/lib/transfers/types";
import type { PublicRental } from "@/lib/rentals/types";
import type { TransitTicket } from "@/lib/transit/types";
import { fmtDay, fmtKsa, ksaDay } from "@/lib/events/format";
import type { EventOrder } from "@/lib/events/types";
import type { RestaurantBooking } from "@/lib/restaurants/bookings";
import type { TrainOrder } from "@/lib/trains/orders";
import { groupByTrip } from "@/lib/account/trips";
import { eventRide, guideRide, packageRide, tableRide, trainRide, type RideTarget } from "@/lib/transport/booking-rides";
import { estimateRide } from "@/lib/transport/rides";
import { STATIONS } from "@/lib/trains/network";
import { RideMenu } from "./transport/ride-menu";
import type { BookingRow } from "./account-view";
import { useApp } from "./app-provider";
import { StatusBadge } from "./booking-details";
import { CalendarIcon, CarIcon, PassportIcon, PhoneIcon, TicketIcon, TrainIcon, UsersIcon } from "./icons";
import { useNetwork } from "./transport/train-ticket-view";
import { Badge, Card, cx, Spinner } from "./ui";

type Kind = "package" | "event" | "train" | "table" | "esim" | "guide" | "transfer" | "rental" | "transit";
const KINDS: Kind[] = ["package", "event", "train", "table", "esim", "guide", "transfer", "rental", "transit"];
const ICONS: Record<Kind, ReactNode> = {
  package: <PassportIcon className="size-5" />,
  event: <TicketIcon className="size-5" />,
  train: <TrainIcon className="size-5" />,
  table: <CalendarIcon className="size-5" />,
  esim: <PhoneIcon className="size-5" />,
  guide: <UsersIcon className="size-5" />,
  transfer: <CarIcon className="size-5" />,
  rental: <CarIcon className="size-5" />,
  transit: <TrainIcon className="size-5" />,
};
const BROWSE: Record<Kind, string> = { package: "/package-visa", event: "/events", train: "/trains", table: "/restaurants", esim: "/esim", guide: "/guides", transfer: "/transport", rental: "/transport#rental", transit: "/transport?city=RUH" };

interface Item {
  kind: Kind;
  id: string;
  href: string;
  title: string;
  subtitle: string;
  /** Start of the booking (ms) for sorting; `day` is its Saudi calendar day. */
  at: number;
  day: string;
  upcoming: boolean;
  /** Happening today (still to come or under way). */
  today: boolean;
  status: ReactNode;
  amount?: string;
  /** Packages: trip dates and whether it is cancelled; eSIMs: the package they were bought with. */
  trip?: { from: string; to: string; cancelled: boolean };
  packageId?: string;
  /** «Order a car» while the booking is current (from the day before until it ends). */
  ride?: RideTarget | null;
}

type Entry = { item: Item; children: Item[] };

/**
 * «My bookings»: every booking of the account in one place — packages with visas, event tickets,
 * train tickets, restaurant tables and eSIMs — today's first, then upcoming, then past.
 */
export function MyBookings({ packages }: { packages: BookingRow[] }) {
  const { t, locale, money, user } = useApp();
  const m = t.account.all;
  const ar = locale === "ar";
  const net = useNetwork();
  const [events, setEvents] = useState<EventOrder[] | null>(null);
  const [trains, setTrains] = useState<TrainOrder[] | null>(null);
  const [tables, setTables] = useState<RestaurantBooking[] | null>(null);
  const [esims, setEsims] = useState<EsimOrder[] | null>(null);
  const [guides, setGuides] = useState<GuideBooking[] | null>(null);
  const [transfers, setTransfers] = useState<PublicTransfer[] | null>(null);
  const [rentals, setRentals] = useState<PublicRental[] | null>(null);
  const [transit, setTransit] = useState<TransitTicket[] | null>(null);
  const [tab, setTab] = useState<"all" | Kind>("all");

  useEffect(() => {
    const load = <T,>(url: string, key: "orders" | "bookings" | "transfers" | "rentals" | "tickets", set: (v: T[]) => void) =>
      fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : {})).then((d) => set((d as Record<string, T[]>)[key] ?? [])).catch(() => set([]));
    void load<EventOrder>("/api/events/orders", "orders", setEvents);
    void load<TrainOrder>("/api/trains/orders", "orders", setTrains);
    void load<RestaurantBooking>("/api/restaurants/bookings", "bookings", setTables);
    void load<EsimOrder>("/api/esim/orders", "orders", setEsims);
    void load<GuideBooking>("/api/guides/bookings", "bookings", setGuides);
    void load<PublicTransfer>("/api/transfers", "transfers", setTransfers);
    void load<PublicRental>("/api/rentals", "rentals", setRentals);
    void load<TransitTicket>("/api/transit/tickets", "tickets", setTransit);
  }, []);

  const loading = !events || !trains || !tables || !esims || !guides || !transfers || !rentals || !transit;
  const items = useMemo<Item[]>(() => {
    const now = Date.now();
    const today = ksaDay(new Date());
    const when = (iso: string) => fmtKsa(iso, locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const st = (code: string) => {
      const s = net?.stations.find((x) => x.code === code);
      return s ? (ar ? s.nameAr : s.nameEn) : code;
    };
    const badge = (label: string, cancelled: boolean) => <Badge tone={cancelled ? "red" : "brand"}>{label}</Badge>;
    const out: Item[] = [];
    for (const b of packages) {
      const cancelled = b.status === "CANCELLED";
      out.push({
        kind: "package", id: b.id, href: `/${locale}/account/bookings/${b.id}`,
        title: `${b.reference} · ${b.cities.map((c) => cityName(c, locale)).join(ar ? "، " : ", ")}`,
        subtitle: `${fmtDay(b.departureDate, locale)} → ${fmtDay(b.returnDate, locale)} · ${b.leadName} · ${b.travellers} ${t.common.travellers}`,
        at: Date.parse(`${b.departureDate}T00:00:00+03:00`), day: b.departureDate,
        upcoming: !cancelled && b.returnDate >= today, today: !cancelled && b.departureDate <= today && b.returnDate >= today,
        status: <StatusBadge status={b.status} />, amount: money(b.totalSAR),
        trip: { from: b.departureDate, to: b.returnDate, cancelled },
        ride: b.ride ? packageRide(b.ride, now, ar) : null,
      });
    }
    for (const o of events ?? []) {
      const end = Date.parse(o.session.start) + o.event.durationMins * 60_000;
      const live = o.status === "CONFIRMED";
      out.push({
        kind: "event", id: o.id, href: `/${locale}/account/tickets/${o.id}`,
        title: ar ? o.event.titleAr : o.event.titleEn,
        subtitle: `${when(o.session.start)} · ${fmt(t.events.ticket.tickets, { n: o.tickets.length })}`,
        at: Date.parse(o.session.start), day: ksaDay(o.session.start),
        upcoming: live && end > now, today: live && end > now && ksaDay(o.session.start) === today,
        status: badge(t.events.ticket.status[o.status], !live), amount: money(o.totalSAR),
        ride: eventRide(o, now, ar),
      });
    }
    for (const o of trains ?? []) {
      const first = o.legs[0].trip;
      const last = o.legs[o.legs.length - 1].trip;
      const live = o.status === "CONFIRMED";
      out.push({
        kind: "train", id: o.id, href: `/${locale}/account/train-tickets/${o.id}`,
        title: `${st(first.from)} ${o.legs.length > 1 ? "⇄" : "→"} ${st(first.to)}`,
        subtitle: `${when(first.depart)} · ${fmt(t.trains.ticket.tickets, { n: o.tickets.length })}`,
        at: Date.parse(first.depart), day: ksaDay(first.depart),
        upcoming: live && Date.parse(last.depart) > now, today: live && Date.parse(last.depart) > now && o.legs.some((l) => ksaDay(l.trip.depart) === today),
        status: badge(t.trains.ticket.status[o.status], !live), amount: money(o.totalSAR),
        ride: trainRide(o, STATIONS, now, ar),
      });
    }
    for (const b of tables ?? []) {
      const live = b.status === "CONFIRMED";
      out.push({
        kind: "table", id: b.id, href: `/${locale}/account/table-bookings/${b.id}`,
        title: ar ? b.restaurant.nameAr : b.restaurant.nameEn,
        subtitle: `${when(b.start)} · ${t.restaurants.booking.party}: ${b.party}`,
        at: Date.parse(b.start), day: b.day,
        upcoming: live && Date.parse(b.start) > now - 2 * 3_600_000, today: live && b.day === today && Date.parse(b.start) > now - 2 * 3_600_000,
        status: badge(t.restaurants.booking.status[b.status], !live), amount: b.fee.paidSAR ? money(b.fee.paidSAR) : undefined,
        ride: tableRide(b, now, ar),
      });
    }
    for (const o of esims ?? []) {
      const e = t.esim;
      const live = o.status === "CONFIRMED";
      const end = Date.parse(o.createdAt) + (o.plan.days + 120) * 86_400_000;
      out.push({
        kind: "esim", id: o.id, href: `/${locale}/account/esim/${o.id}`,
        title: `${o.plan.dataGB === null ? e.unlimited : fmt(e.dataGB, { n: o.plan.dataGB })} · ${fmt(e.days, { n: o.plan.days })}`,
        subtitle: `${o.lines.map((l) => l.name).join(ar ? "، " : ", ")}${o.booking ? ` · ${fmt(e.order.withPackage, { ref: o.booking.reference })}` : ""}`,
        at: Date.parse(o.createdAt), day: o.createdAt.slice(0, 10),
        upcoming: live && now < end, today: false,
        status: badge(e.order.status[o.status], !live), amount: money(o.totalSAR),
        packageId: o.booking?.id,
      });
    }
    for (const b of guides ?? []) {
      const live = b.status === "pending" || b.status === "confirmed";
      const start = Date.parse(`${b.date}T${b.startTime}:00+03:00`);
      const end = start + b.hours * 3_600_000;
      out.push({
        kind: "guide", id: b.id, href: `/${locale}/account/guide-bookings/${b.id}`,
        title: ar ? b.guide.nameAr : b.guide.nameEn,
        subtitle: `${when(new Date(start).toISOString())} · ${cityName(b.city, locale)} · ${fmt(t.guides.booking.people, { n: b.people })}`,
        at: start, day: b.date,
        upcoming: live && end > now, today: live && end > now && b.date === today,
        status: <Badge tone={b.status === "confirmed" ? "brand" : b.status === "pending" ? "amber" : "red"}>{t.guides.booking.status[b.status]}</Badge>,
        ride: guideRide(b, now, ar),
      });
    }
    for (const x of transfers ?? []) {
      const live = x.status === "requested" || x.status === "confirmed";
      const start = Date.parse(`${x.pickupAt}:00+03:00`);
      const airport = ar ? `مطار ${cityName(x.airport, "ar")}` : `${cityName(x.airport, "en")} airport`;
      out.push({
        kind: "transfer", id: x.id, href: `/${locale}/account/transfers/${x.id}`,
        title: `${t.transfers.direction[x.direction]} · ${airport}`,
        subtitle: `${when(new Date(start).toISOString())} · ${t.transfers.vehicles[x.vehicle]}${x.driver ? ` · ${x.driver.name}` : ""}`,
        at: start, day: x.pickupAt.slice(0, 10),
        upcoming: live && start > now - 3_600_000, today: live && x.pickupAt.slice(0, 10) === today,
        status: <Badge tone={x.status === "confirmed" ? "brand" : x.status === "requested" ? "amber" : x.status === "completed" ? "slate" : "red"}>{t.transfers.status[x.status]}</Badge>,
        amount: money(x.priceSAR),
        packageId: x.bookingId ?? undefined,
      });
    }
    for (const x of rentals ?? []) {
      const live = x.status === "requested" || x.status === "confirmed";
      const start = Date.parse(`${x.pickupAt}:00+03:00`);
      const end = Date.parse(`${x.returnAt}:00+03:00`);
      out.push({
        kind: "rental", id: x.id, href: `/${locale}/account/rentals/${x.id}`,
        title: `${t.rentals.classes[x.carClass]} · ${ar ? x.providerNameAr : x.providerNameEn}`,
        subtitle: `${when(new Date(start).toISOString())} → ${when(new Date(end).toISOString())} · ${cityName(x.city, locale)}`,
        at: start, day: x.pickupAt.slice(0, 10),
        upcoming: live && end > now, today: live && start <= now + 86_400_000 && end > now && x.pickupAt.slice(0, 10) <= today,
        status: <Badge tone={x.status === "confirmed" ? "brand" : x.status === "requested" ? "amber" : x.status === "completed" ? "slate" : "red"}>{t.rentals.status[x.status]}</Badge>,
        amount: money(x.totalSAR),
        packageId: x.bookingId ?? undefined,
      });
    }
    for (const k of transit ?? []) {
      const live = k.status === "unused" || k.status === "active";
      const at = Date.parse(k.activatedAt ?? k.createdAt);
      out.push({
        kind: "transit", id: k.id, href: `/${locale}/account/transit/${k.id}`,
        title: ar ? k.nameAr : k.nameEn,
        subtitle: `${cityName(k.city, locale)} · ${k.reference}${k.validUntil ? ` · ${fmt(t.transit.validUntil, { time: when(k.validUntil) })}` : ""}`,
        at, day: k.createdAt.slice(0, 10),
        upcoming: live, today: k.status === "active",
        status: <Badge tone={k.status === "active" ? "brand" : k.status === "unused" ? "amber" : "slate"}>{t.transit.status[k.status]}</Badge>,
        amount: money(k.priceSAR),
      });
    }
    return out;
  }, [packages, events, trains, tables, esims, guides, transfers, rentals, transit, net, locale, ar, money, t]);

  const shown = items.filter((i) => tab === "all" || i.kind === tab);
  // "All" and "Packages" show each trip with the bookings made for it; the other tabs stay flat.
  const entries: Entry[] = tab === "all" ? groupByTrip(items) : tab === "package" ? groupByTrip(items).filter((e) => e.item.kind === "package") : shown.map((item) => ({ item, children: [] }));
  const todays = entries.filter((e) => e.item.today).sort((a, b) => a.item.at - b.item.at);
  const upcoming = entries.filter((e) => e.item.upcoming && !e.item.today).sort((a, b) => a.item.at - b.item.at);
  const past = entries.filter((e) => !e.item.upcoming).sort((a, b) => b.item.at - a.item.at);
  const count = (k: "all" | Kind) => items.filter((i) => k === "all" || i.kind === k).length;
  const isCo = user?.accountType === "company";

  const row = (i: Item, child = false) => (
    <div className={cx("flex items-center gap-2 hover:bg-slate-50", child ? "rounded-lg pe-3" : "pe-5")}>
      <Link href={i.href} className={cx("flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3", child ? "px-3 py-2.5" : "py-4 ps-5")} data-testid={`my-booking-${i.kind}`}>
        <div className="flex min-w-0 items-start gap-3">
          <span className={cx("mt-0.5 grid shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700", child ? "size-7 [&_svg]:size-4" : "size-9")}>{ICONS[i.kind]}</span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">{m.kinds[i.kind]}</p>
            <p className={cx("font-semibold", child && "text-sm")}>{i.title}</p>
            <p className="text-xs text-slate-500">{i.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {i.status}
          {i.amount && <span className="ltr-nums text-sm font-semibold">{i.amount}</span>}
        </div>
      </Link>
      {i.ride && <RideMenu to={i.ride.to} estimate={i.ride.from ? estimateRide(i.ride.from, i.ride.to) : null} className="shrink-0" />}
    </div>
  );

  const list = (rows: Entry[]) => (
    <ul className="divide-y divide-slate-100">
      {rows.map(({ item, children }) => (
        <li key={`${item.kind}-${item.id}`} data-testid={children.length ? "my-trip" : undefined}>
          {row(item)}
          {children.length > 0 && (
            <div className="mx-5 mb-4 rounded-xl border border-brand-100 bg-brand-50/40 p-2" data-testid="my-trip-children">
              <p className="px-3 pt-1 text-xs font-bold text-brand-800">{fmt(m.inTrip, { n: children.length })}</p>
              <ul className="divide-y divide-brand-100/70 border-s-2 border-brand-200 ps-2">
                {children.map((c) => <li key={`${c.kind}-${c.id}`}>{row(c, true)}</li>)}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <Card className="overflow-hidden" data-testid="my-bookings">
      <div className="border-b border-slate-100 px-5 py-4 font-bold">{isCo ? t.account.clientBookings : t.account.bookings}</div>
      <div className="flex gap-1.5 overflow-x-auto border-b border-slate-100 px-4 py-3" role="tablist">
        {(["all", ...KINDS] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cx("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold", tab === k ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}>
            {m.tabs[k]} <span className="opacity-70">{count(k)}</span>
          </button>
        ))}
      </div>
      {loading && tab !== "package" ? (
        <div className="grid place-items-center py-10"><Spinner className="size-6 text-brand-600" /></div>
      ) : shown.length === 0 ? (
        <div className="space-y-3 p-8 text-center">
          <p className="text-sm text-slate-500">{m.empty}</p>
          {tab !== "all" && <Link href={`/${locale}${BROWSE[tab]}`} className="inline-flex h-10 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">{m.browse[tab]}</Link>}
        </div>
      ) : (
        <>
          {todays.length > 0 && (
            <section className="border-b border-gold-500/30 bg-gold-50" data-testid="my-bookings-today">
              <p className="px-5 pt-4 font-bold text-ink">{m.today}</p>
              <p className="px-5 text-xs text-slate-600">{m.todayHint}</p>
              {list(todays)}
            </section>
          )}
          {upcoming.length > 0 && (
            <section>
              <p className="px-5 pt-4 text-sm font-bold text-slate-700">{m.upcoming}</p>
              {upcoming.some((e) => !e.item.ride) && <p className="px-5 pt-1 text-xs text-slate-500" data-testid="ride-hint">{m.rideHint}</p>}
              {list(upcoming)}
            </section>
          )}
          {past.length > 0 && (
            <section className="border-t border-slate-100">
              <p className="px-5 pt-4 text-sm font-bold text-slate-500">{m.past}</p>
              {list(past)}
            </section>
          )}
        </>
      )}
    </Card>
  );
}
