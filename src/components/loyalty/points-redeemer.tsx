"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { fmt, type Dictionary } from "@/i18n";
import { bestCampaign, earnPoints, LOYALTY, maxRedeemable, pointsValueSAR, type EarnService } from "@/lib/loyalty/rules";
import type { OrderLoyalty } from "@/lib/loyalty/types";
import { useApp } from "../app-provider";
import { GiftIcon } from "../icons";
import { Badge, cx, Input } from "../ui";
import { useLoyalty } from "./use-loyalty";

/** Message for a loyalty error code returned by a checkout (null when it isn't one). */
export function loyaltyError(t: Dictionary, code: string | null | undefined): string | null {
  return code ? (t.loyalty.errors as Record<string, string>)[code] ?? null : null;
}

/** What the card pays once the points discount is taken off. */
export const afterPoints = (totalSAR: number, points: number) => Math.round((totalSAR - pointsValueSAR(points)) * 100) / 100;

/**
 * Checkout box of the loyalty programme: the member's balance, the choice to pay part with points
 * (up to 30%, from 500 points; packages keep 2,000 SAR per adult paid) and the points this
 * purchase will earn. Hidden for company accounts and signed-out visitors.
 */
export function PointsRedeemer({
  service,
  totalSAR,
  floorSAR,
  earnBase,
  extraEarn = [],
  cities = [],
  value,
  onChange,
  className,
}: {
  service: EarnService;
  /** Price the points can pay part of. */
  totalSAR: number;
  /** Amount that must stay paid (packages). */
  floorSAR?: number;
  /** Amount earning points before the discount (defaults to the price; packages leave out visa fees). */
  earnBase?: number;
  /** Other items paid together that earn points on their own (e.g. eSIMs with a package). */
  extraEarn?: { service: EarnService; sar: number }[];
  cities?: string[];
  value: number;
  onChange: (points: number) => void;
  className?: string;
}) {
  const { t, locale, money, user } = useApp();
  const l = t.loyalty;
  const eligible = user?.accountType === "individual";
  const data = useLoyalty(eligible);
  const s = data?.summary;
  const max = s ? maxRedeemable({ totalSAR, balance: s.available, floorSAR }) : 0;

  // Keep the chosen points within what this price allows.
  useEffect(() => {
    if (value && value > max) onChange(max);
  }, [value, max, onChange]);

  const earned = useMemo(() => {
    if (!s) return { points: 0, campaign: null };
    const campaign = bestCampaign(s.campaigns, service, cities);
    const discount = pointsValueSAR(Math.min(value, max));
    const points =
      earnPoints({ service, eligibleSAR: (earnBase ?? totalSAR) - discount, tierMultiplier: s.tier.multiplier, campaignMultiplier: campaign?.multiplier }) +
      extraEarn.reduce((a, x) => a + earnPoints({ service: x.service, eligibleSAR: x.sar, tierMultiplier: s.tier.multiplier, campaignMultiplier: bestCampaign(s.campaigns, x.service, cities)?.multiplier }), 0);
    return { points, campaign };
  }, [s, service, cities, value, max, earnBase, totalSAR, extraEarn]);

  if (!eligible || !s) return null;
  const using = value > 0;
  return (
    <div className={cx("rounded-lg bg-gold-50 p-3 text-sm ring-1 ring-gold-500/30", className)} data-testid="points-redeemer">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold text-ink">
          <GiftIcon className="size-4 text-gold-600" />
          {l.programName}
        </p>
        <Badge tone="gold">{l.tiers[s.tier.id as keyof typeof l.tiers]}</Badge>
      </div>
      <p className="mt-1 text-slate-700">{fmt(l.checkout.balance, { n: s.available.toLocaleString("en"), amount: money(pointsValueSAR(s.available)) })}</p>
      {max > 0 ? (
        <div className="mt-2 space-y-2">
          <label className="flex cursor-pointer items-center gap-2 font-medium">
            <input type="checkbox" className="size-4 accent-brand-700" checked={using} onChange={(e) => onChange(e.target.checked ? max : 0)} data-testid="points-use" />
            {l.checkout.use}
          </label>
          {using && (
            <div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  dir="ltr"
                  inputMode="numeric"
                  aria-label={l.checkout.points}
                  min={LOYALTY.minRedeemPoints}
                  max={max}
                  step={1}
                  value={value}
                  onChange={(e) => onChange(Math.max(0, Math.min(max, Math.floor(Number(e.target.value) || 0))))}
                  className="h-9 w-32"
                  data-testid="points-input"
                />
                <span className="font-semibold text-emerald-700" data-testid="points-discount">−{money(pointsValueSAR(value))}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{fmt(floorSAR ? l.checkout.rangePackage : l.checkout.range, { min: LOYALTY.minRedeemPoints, max: max.toLocaleString("en") })}</p>
              {value > 0 && value < LOYALTY.minRedeemPoints && <p className="mt-1 text-xs text-red-600">{l.errors.redeemBelowMinimum}</p>}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-1 text-xs text-slate-500">
          {s.available < LOYALTY.minRedeemPoints ? fmt(l.checkout.needMin, { min: LOYALTY.minRedeemPoints }) : l.checkout.noRoom}
        </p>
      )}
      {earned.points > 0 && (
        <p className="mt-2 text-emerald-800" data-testid="points-earn">
          ⭐ {fmt(l.checkout.earn, { n: earned.points.toLocaleString("en") })} <span className="text-xs text-slate-500">— {l.checkout.earnWhen}</span>
          {earned.campaign && <span className="block text-xs text-gold-700">{fmt(l.checkout.campaign, { name: locale === "ar" ? earned.campaign.nameAr : earned.campaign.nameEn, x: earned.campaign.multiplier })}</span>}
        </p>
      )}
    </div>
  );
}

/** Points used and earned on a booking or order (booking pages). */
export function OrderPoints({ loyalty, className }: { loyalty?: OrderLoyalty; className?: string }) {
  const { t, locale, money } = useApp();
  if (!loyalty || (!loyalty.redeemedPoints && !loyalty.earnedPoints)) return null;
  const o = t.loyalty.order;
  return (
    <div className={cx("rounded-lg bg-gold-50 p-3 text-sm ring-1 ring-gold-500/30", className)} data-testid="order-points">
      <p className="flex items-center gap-2 font-semibold"><GiftIcon className="size-4 text-gold-600" />{o.title}</p>
      <dl className="mt-2 space-y-1">
        {loyalty.redeemedPoints > 0 && (
          <div className="flex justify-between gap-3"><dt>{o.used}</dt><dd className="ltr-nums font-semibold">{loyalty.redeemedPoints.toLocaleString("en")} (−{money(loyalty.discountSAR)})</dd></div>
        )}
        {loyalty.earnedPoints > 0 && (
          <div className="flex justify-between gap-3"><dt>{o.earned}</dt><dd className="ltr-nums font-semibold text-emerald-700">+{loyalty.earnedPoints.toLocaleString("en")}</dd></div>
        )}
      </dl>
      <Link href={`/${locale}/account/loyalty`} className="mt-2 inline-block text-xs font-semibold text-brand-700 underline">{o.view}</Link>
    </div>
  );
}
