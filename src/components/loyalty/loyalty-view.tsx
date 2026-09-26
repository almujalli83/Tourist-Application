"use client";

import { useState } from "react";
import { fmt } from "@/i18n";
import { fmtKsa } from "@/lib/events/format";
import { LOYALTY, pointsValueSAR } from "@/lib/loyalty/rules";
import type { LoyaltyEntry } from "@/lib/loyalty/types";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { GiftIcon, UsersIcon } from "../icons";
import { Alert, Badge, Button, Card, cx, Spinner } from "../ui";
import { useLoyalty } from "./use-loyalty";

/** Status of a ledger line: credits show when they become usable or expire. */
function useEntryStatus() {
  const { t, locale } = useApp();
  const l = t.loyalty;
  const now = new Date().toISOString();
  const day = (iso: string) => fmtKsa(iso, locale, { day: "numeric", month: "short", year: "numeric" });
  return (e: LoyaltyEntry): { text: string; tone: "gold" | "brand" | "slate" } | null => {
    if (e.remaining === undefined) return null;
    if (e.expiresAt! <= now) return { text: l.status.expired, tone: "slate" };
    if (e.remaining === 0) return { text: l.status.used, tone: "slate" };
    if (e.availableAt! > now) return { text: fmt(l.status.pending, { date: day(e.availableAt!) }), tone: "gold" };
    return { text: fmt(l.status.available, { date: day(e.expiresAt!) }), tone: "brand" };
  };
}

/** Service 10 — the member's points, tier, invitation code, offers and history. */
export function LoyaltyView() {
  const { t, locale, money, user } = useApp();
  const l = t.loyalty;
  const data = useLoyalty(!!user);
  const status = useEntryStatus();
  const [copied, setCopied] = useState(false);

  if (!data) return <div className="grid min-h-[40vh] place-items-center text-brand-700"><Spinner className="size-8" /></div>;
  const s = data.summary;
  const tierName = (id: string) => l.tiers[id as keyof typeof l.tiers] ?? id;
  const n = (x: number) => x.toLocaleString("en");
  const next = s.next;
  const progress = next ? Math.min(100, Math.round((s.spend12mSAR / next.minSpendSAR) * 100)) : 100;

  async function copyLink() {
    const link = `${window.location.origin}/${locale}/register?ref=${s.referralCode}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      window.prompt(l.referral.copy, link);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <BackLink href={`/${locale}/account`} label={t.account.title} className="-ms-2.5" />
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><GiftIcon className="size-6 text-gold-600" />{l.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{l.intro}</p>
      </div>

      {!s.eligible ? (
        <Alert tone="info">{l.notEligible}</Alert>
      ) : (
        <>
          {s.demo && <Alert tone="info">{l.demoHint}</Alert>}
          {s.expiring && <Alert tone="warning">{fmt(l.expiring, { n: n(s.expiring.points), date: fmtKsa(`${s.expiring.date}T12:00:00+03:00`, locale, { day: "numeric", month: "long", year: "numeric" }) })}</Alert>}
          {s.deficit > 0 && <Alert tone="warning">{fmt(l.deficit, { n: n(s.deficit) })}</Alert>}

          <div className="grid gap-3 md:grid-cols-3">
            <Card className="p-5">
              <p className="text-sm text-slate-500">{l.available}</p>
              <p className="ltr-nums mt-1 text-3xl font-bold text-brand-800" data-testid="points-available">{n(s.available)}</p>
              <p className="mt-1 text-sm text-slate-600">{fmt(l.worth, { amount: money(pointsValueSAR(s.available)) })}</p>
              <p className="mt-2 text-xs text-slate-500">{fmt(l.lifetime, { n: n(s.lifetimeEarned) })}</p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-slate-500">{l.pending}</p>
              <p className="ltr-nums mt-1 text-3xl font-bold text-gold-700" data-testid="points-pending">{n(s.pending)}</p>
              <p className="mt-1 text-xs text-slate-500">{l.pendingHint}</p>
            </Card>
            <Card className="p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-slate-500">{l.tier}</p>
                <Badge tone="gold">{fmt(l.tierMultiplier, { x: s.tier.multiplier })}</Badge>
              </div>
              <p className="mt-1 text-2xl font-bold text-ink" data-testid="points-tier">{tierName(s.tier.id)}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gold-500" style={{ width: `${progress}%` }} /></div>
              <p className="mt-2 text-xs text-slate-600">{fmt(l.spend12m, { amount: money(s.spend12mSAR) })}</p>
              <p className="mt-1 text-xs text-slate-500">{next ? fmt(l.toNext, { amount: money(s.toNextSAR), tier: tierName(next.id) }) : l.topTier}</p>
            </Card>
          </div>

          {s.campaigns.length > 0 && (
            <Card className="p-5">
              <h2 className="font-bold">{l.campaigns.title}</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {s.campaigns.map((c) => (
                  <li key={c.id} className="rounded-lg bg-gold-50 p-3 text-sm ring-1 ring-gold-500/30">
                    <p className="font-semibold">{locale === "ar" ? c.nameAr : c.nameEn} · {fmt(l.campaigns.multiplier, { x: c.multiplier })}</p>
                    <p className="text-xs text-slate-600">
                      {c.services.length ? c.services.map((x) => l.sources[x]).join(locale === "ar" ? "، " : ", ") : l.campaigns.all}
                      {c.cities.length ? ` · ${c.cities.join(", ")}` : ""} · {fmt(l.campaigns.until, { date: c.to })}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {s.eligible && (
          <Card className="p-5 sm:p-6">
            <h2 className="font-bold">{l.history.title}</h2>
            {data.entries.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500" data-testid="points-history-empty">{l.history.empty}</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100" data-testid="points-history">
                {data.entries.map((e) => {
                  const st = status(e);
                  return (
                    <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">
                          {l.types[e.type]}
                          {e.source && e.source.kind !== "admin" && <span className="font-normal text-slate-600"> · {l.sources[e.source.kind]}{e.source.reference ? ` ${e.source.reference}` : ""}</span>}
                        </p>
                        <p className="text-xs text-slate-500">
                          {fmtKsa(e.at, locale, { day: "numeric", month: "short", year: "numeric" })}
                          {e.discountSAR ? ` · −${money(e.discountSAR)}` : ""}
                          {e.note ? ` · ${e.note}` : ""}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {st && <Badge tone={st.tone}>{st.text}</Badge>}
                          {e.demo && <Badge>{l.demo}</Badge>}
                        </div>
                      </div>
                      <span className={cx("ltr-nums font-bold", e.points >= 0 ? "text-emerald-700" : "text-slate-700")}>{e.points >= 0 ? "+" : "−"}{n(Math.abs(e.points))}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        <div className="space-y-6">
          {s.eligible && s.referralCode && (
            <Card className="p-5">
              <h2 className="flex items-center gap-2 font-bold"><UsersIcon className="size-5 text-brand-700" />{l.referral.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{fmt(l.referral.text, { referrer: LOYALTY.referrerBonus, referee: LOYALTY.refereeBonus })}</p>
              <p className="mt-3 text-xs text-slate-500">{l.referral.code}</p>
              <p className="ltr-nums text-xl font-bold tracking-widest text-brand-800" data-testid="referral-code">{s.referralCode}</p>
              <Button size="sm" variant="secondary" className="mt-3" onClick={() => void copyLink()}>{copied ? l.referral.copied : l.referral.copy}</Button>
            </Card>
          )}
          <Card className="p-5 text-sm">
            <h2 className="font-bold">{l.how.title}</h2>
            {([
              [l.how.earn, l.how.earnLines],
              [l.how.redeem, l.how.redeemLines],
              [l.how.rules, l.how.rulesLines],
            ] as const).map(([title, lines]) => (
              <div key={title} className="mt-3">
                <h3 className="font-semibold text-brand-800">{title}</h3>
                <ul className="mt-1 list-disc space-y-1 ps-5 text-slate-700">
                  {lines.map((x) => <li key={x}>{fmt(x, { review: LOYALTY.reviewBonus, min: LOYALTY.minRedeemPoints })}</li>)}
                </ul>
              </div>
            ))}
            <h3 className="mt-3 font-semibold text-brand-800">{l.how.tiersTitle}</h3>
            <ul className="mt-1 space-y-1 text-slate-700">
              {LOYALTY.tiers.map((x) => (
                <li key={x.id} className={cx("flex justify-between gap-2 rounded-md px-2 py-1", s.tier.id === x.id && "bg-gold-50 font-semibold")}>
                  <span>{tierName(x.id)}</span>
                  <span className="text-xs text-slate-600">{fmt(l.how.tierRow, { amount: money(x.minSpendSAR), x: x.multiplier })}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
