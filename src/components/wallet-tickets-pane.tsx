"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useApp } from "./app-provider";
import { Badge, Card, SectionTitle, Spinner } from "./ui";

export interface TicketItem {
  id: string;
  href: string;
  title: string;
  subtitle: string;
  status: { label: string; tone: "brand" | "red" | "slate" };
  upcoming: boolean;
}

/** Wallet pane for the account's tickets, styled like a traveller's document sections. */
export function WalletTicketsPane({ title, subtitle, icon, action, items, emptyText, testid }: {
  title: string; subtitle: string; icon: ReactNode; action: { href: string; label: string }; items: TicketItem[] | null; emptyText: string; testid: string;
}) {
  const { t } = useApp();
  const w = t.wallet;
  const upcoming = items?.filter((i) => i.upcoming) ?? [];
  const past = items?.filter((i) => !i.upcoming) ?? [];

  const list = (rows: TicketItem[]) => (
    <ul className="mt-4 space-y-2">
      {rows.map((i) => (
        <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
          <div className="min-w-0">
            <p className="font-semibold">{i.title}</p>
            <p className="text-xs text-slate-500">{i.subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone={i.status.tone}>{i.status.label}</Badge>
            <Link href={i.href} className="text-sm font-semibold text-brand-700 hover:underline">{w.openDocs}</Link>
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="min-w-0 space-y-5" data-testid={testid}>
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="text-lg font-bold">{title}</p>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <Link href={action.href} className="inline-flex h-10 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">{action.label}</Link>
      </Card>

      {items === null ? (
        <Card className="grid place-items-center p-10"><Spinner className="size-6 text-brand-600" /></Card>
      ) : (
        <>
          <Card className="p-5 sm:p-6">
            <SectionTitle title={w.ticketsUpcoming} icon={icon} />
            {upcoming.length ? list(upcoming) : <p className="mt-3 text-sm text-slate-500">{emptyText}</p>}
          </Card>
          {past.length > 0 && (
            <Card className="p-5 sm:p-6">
              <SectionTitle title={w.ticketsPast} icon={icon} />
              {list(past)}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
