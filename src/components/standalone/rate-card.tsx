"use client";

import { fmt } from "@/i18n";
import type { HotelOffer } from "@/lib/types";
import { useApp } from "../app-provider";
import { HotelIcon, MapPinIcon } from "../icons";
import { Badge, Button, Card, cx, Stars } from "../ui";

/** One hotel rate: stars, agent and licence, how it is paid and cancelled, and the price. */
export function RateCard({ offer, selected, onSelect, when }: { offer: HotelOffer; selected?: boolean; onSelect?: () => void; when: (iso: string) => string }) {
  const { t, locale, money } = useApp();
  const h = t.standalone.hotels;
  const ar = locale === "ar";
  const hotelPay = offer.rate?.pay === "hotel";
  return (
    <Card className={cx("flex flex-col gap-3 p-4 sm:flex-row sm:items-center", selected && "ring-2 ring-brand-600/60")} data-testid="st-rate">
      <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><HotelIcon className="size-6" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold">{ar ? offer.nameAr : offer.nameEn}</h3>
          <Stars n={offer.stars} />
          <Badge tone="slate">{offer.reviewScore.toFixed(1)}</Badge>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1"><MapPinIcon className="size-3.5" />{ar ? offer.districtAr : offer.districtEn}</span>
          <span>{ar ? offer.roomTypeAr : offer.roomTypeEn} · {t.hotels.board[offer.board]}</span>
          <span>{t.common.agent}: {ar ? offer.agentNameAr : offer.agentNameEn}</span>
          <span className="ltr-nums">{h.license} {offer.licenseNo}</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone={hotelPay ? "gold" : "brand"}><span data-testid="st-rate-pay">{hotelPay ? h.payHotel : h.payOnline}</span></Badge>
          <Badge tone={offer.rate?.freeCancelUntil ? "brand" : "slate"}>{offer.rate?.freeCancelUntil ? fmt(h.freeCancel, { date: when(offer.rate.freeCancelUntil) }) : h.nonRefundable}</Badge>
        </div>
      </div>
      <div className="flex items-end justify-between gap-3 sm:flex-col sm:items-end">
        <div className="text-end">
          <p className="ltr-nums text-lg font-bold text-brand-800">{money(offer.totalSAR)}</p>
          <p className="text-[11px] text-slate-500"><span className="ltr-nums">{money(offer.pricePerNightSAR)}</span> {h.perNight} · {fmt(h.nights, { n: offer.nights })}</p>
        </div>
        {onSelect && <Button size="sm" onClick={onSelect} data-testid="st-select">{h.select}</Button>}
      </div>
    </Card>
  );
}
