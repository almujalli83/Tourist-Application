"use client";

import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import type { TouristCard } from "@/lib/card/card";
import { cityName } from "@/lib/data/cities";
import { countryName } from "@/lib/data/countries";
import { fmtDay, fmtKsa } from "@/lib/events/format";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { KaabaIcon, Logo, PassportIcon, UserIcon } from "../icons";
import { Badge, Card, cx, Spinner } from "../ui";

interface Codes { live: { token: string; expiresAt: string; svg: string }; offline: { token: string; expiresAt: string; svg: string } }
interface Cached { card: TouristCard; offlineSvg: string; offlineExp: string; updatedAt: string }

const cacheKey = (id: string) => `card:cache:${id}`;
const readCache = (id: string): Cached | null => {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(id)) ?? "null");
  } catch {
    return null;
  }
};

function CardFace({ card, codes, offline }: { card: TouristCard; codes: Codes | null; offline: Cached | null }) {
  const { t, locale } = useApp();
  const c = t.card;
  const [left, setLeft] = useState(0);
  const [photoOk, setPhotoOk] = useState(true);
  useEffect(() => {
    if (!codes) return;
    const tick = () => setLeft(Math.max(0, Math.round((Date.parse(codes.live.expiresAt) - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [codes]);
  const d = (x: string) => fmtDay(x, locale, { day: "numeric", month: "long", year: "numeric" });
  const offlineUsable = !codes && offline && Date.parse(offline.offlineExp) > Date.now();

  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]" data-testid="tourist-card">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600 p-6 text-white shadow-xl">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-bold"><Logo className="size-8" />{t.meta.appName}</span>
          <span className={cx("rounded-full px-3 py-1 text-xs font-bold", card.valid ? "bg-emerald-400/20 text-emerald-100 ring-1 ring-emerald-300/40" : "bg-red-500/30 text-red-50")} data-testid="card-status">
            {card.valid ? c.status.valid : c.status.invalid}
          </span>
        </div>
        <div className="mt-6 flex items-center gap-4">
          <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white/15 ring-2 ring-white/30">
            {codes && photoOk && !card.demo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/card/photo/${codes.live.token}`} alt="" className="size-full object-cover" onError={() => setPhotoOk(false)} />
            ) : <UserIcon className="size-10 text-white/70" />}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-brand-100">{c.holder}</p>
            <p className="truncate text-2xl font-bold tracking-wide" dir="ltr">{card.nameEn}</p>
            <p className="text-sm text-brand-100">{countryName(card.nationality, locale)}</p>
          </div>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div><dt className="text-xs text-brand-100">{c.visa}</dt><dd className="font-semibold">{c.visaType}</dd></div>
          <div><dt className="text-xs text-brand-100">{c.visaNumber}</dt><dd className="ltr-nums font-semibold">{card.visaNumber}</dd></div>
          <div><dt className="text-xs text-brand-100">{c.validUntil}</dt><dd className="font-semibold">{d(card.visaExpiryDate)}</dd></div>
          <div><dt className="text-xs text-brand-100">{c.passport}</dt><dd className="ltr-nums font-semibold" dir="ltr">•••• {card.passportLast4}</dd></div>
          <div><dt className="text-xs text-brand-100">{c.insurance}</dt><dd className="font-semibold">{c.insuranceStatus[card.insurance]}</dd></div>
          {card.trip && (
            <div><dt className="text-xs text-brand-100">{c.trip}</dt>
              <dd className="font-semibold">{card.trip.city ? cityName(card.trip.city, locale) : "—"}{card.trip.hotelAr ? ` — ${locale === "ar" ? card.trip.hotelAr : card.trip.hotelEn}` : ""}</dd>
              <dd className="text-xs text-brand-100">{fmt(c.until, { date: d(card.trip.returnDate) })} · <span className="ltr-nums">{card.trip.reference}</span></dd>
            </div>
          )}
        </dl>
        {card.permits?.length > 0 && (
          <div className="mt-5 rounded-2xl bg-white/10 p-3 ring-1 ring-white/20" data-testid="card-permits">
            <p className="flex items-center gap-1.5 text-xs font-bold text-gold-100"><KaabaIcon className="size-4" />{t.umrah.permits.onCard}</p>
            <ul className="mt-1.5 space-y-1 text-sm">
              {card.permits.map((p) => (
                <li key={p.permitNo} className="flex flex-wrap justify-between gap-x-3">
                  <span className="font-semibold">{t.umrah.permits.type[p.type]} · {d(p.date)}</span>
                  <span className="ltr-nums" dir="ltr">{p.start}–{p.end} · {p.permitNo}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {card.demo && <p className="mt-4"><Badge tone="gold">{c.sample}</Badge></p>}
      </div>

      <Card className="grid place-items-center p-6 text-center" data-testid="card-qr">
        {codes ? (
          <>
            <div className="w-full max-w-[260px] [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: codes.live.svg }} />
            <p className="mt-3 text-sm font-semibold text-brand-800" data-testid="qr-countdown">{fmt(c.qrHint, { s: left })}</p>
          </>
        ) : offlineUsable ? (
          <>
            <div className="w-full max-w-[260px] [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: offline!.offlineSvg }} />
            <p className="mt-3 text-xs text-amber-700">{fmt(c.offline, { time: fmtKsa(offline!.updatedAt, locale, { hour: "2-digit", minute: "2-digit" }) })}</p>
          </>
        ) : (
          <p className="text-sm text-slate-500">{c.offlineMissing}</p>
        )}
      </Card>
    </div>
  );
}

/** Digital tourist card(s) of the account, with the rotating verification code. */
export function CardView() {
  const { t, locale } = useApp();
  const c = t.card;
  const [cards, setCards] = useState<TouristCard[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [codes, setCodes] = useState<Codes | null>(null);
  const [cached, setCached] = useState<Cached | null>(null);

  useEffect(() => {
    fetch("/api/card", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { cards: TouristCard[] }) => {
        setCards(d.cards);
        setSelected((s) => s ?? d.cards[0]?.id ?? null);
        try {
          localStorage.setItem("card:list", JSON.stringify(d.cards.map((x) => x.id)));
        } catch { /* private mode */ }
      })
      .catch(() => {
        // Offline: the cards saved on this device.
        try {
          const ids: string[] = JSON.parse(localStorage.getItem("card:list") ?? "[]");
          const list = ids.map(readCache).filter((x): x is Cached => !!x).map((x) => x.card);
          setCards(list);
          setSelected(list[0]?.id ?? null);
        } catch {
          setCards([]);
        }
      });
  }, []);

  const loadCodes = useCallback(async (id: string, card: TouristCard | undefined) => {
    setCached(readCache(id));
    try {
      const r = await fetch(`/api/card/token?id=${encodeURIComponent(id)}&locale=${locale}`, { cache: "no-store" });
      if (!r.ok) throw new Error();
      const d: Codes = await r.json();
      setCodes(d);
      if (card) {
        const entry: Cached = { card, offlineSvg: d.offline.svg, offlineExp: d.offline.expiresAt, updatedAt: new Date().toISOString() };
        try {
          localStorage.setItem(cacheKey(id), JSON.stringify(entry));
        } catch { /* private mode */ }
        setCached(entry);
      }
    } catch {
      setCodes(null);
    }
  }, [locale]);

  useEffect(() => {
    if (!selected) return;
    const card = cards?.find((x) => x.id === selected);
    void loadCodes(selected, card);
    const id = setInterval(() => void loadCodes(selected, card), 50_000);
    return () => clearInterval(id);
  }, [selected, cards, loadCodes]);

  const card = cards?.find((x) => x.id === selected);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <BackLink href={`/${locale}/account`} label={t.account.title} className="-ms-2.5" />
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><PassportIcon className="size-7 text-brand-700" />{c.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{c.intro}</p>
      </div>
      {!cards ? (
        <div className="grid min-h-[30vh] place-items-center text-brand-700"><Spinner className="size-8" /></div>
      ) : cards.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">{c.empty}</Card>
      ) : (
        <>
          {cards.length > 1 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-600">{c.family}</p>
              <div className="flex flex-wrap gap-2" role="tablist">
                {cards.map((x) => (
                  <button key={x.id} type="button" role="tab" aria-selected={selected === x.id} onClick={() => setSelected(x.id)} data-testid="card-tab"
                    className={cx("h-9 rounded-full px-4 text-sm font-semibold", selected === x.id ? "bg-brand-800 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200")} dir="ltr">
                    {x.nameEn}
                  </button>
                ))}
              </div>
            </div>
          )}
          {card && <CardFace key={card.id} card={card} codes={codes} offline={cached} />}
        </>
      )}
    </div>
  );
}
