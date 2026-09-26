"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtKsa } from "@/lib/events/format";
import type { AppNotification, NotificationKind } from "@/lib/reminders/reminders";
import { useApp } from "./app-provider";
import { BackLink } from "./back-link";
import { CalendarIcon, PassportIcon, PlaneIcon, StarIcon, TrashIcon } from "./icons";
import { NOTIFICATIONS_CHANGED } from "./notification-bell";
import { Alert, Badge, Card, cx, Spinner } from "./ui";

const ICON: Record<NotificationKind, typeof PlaneIcon> = { arrival: PlaneIcon, departure: CalendarIcon, visa7: PassportIcon, visa1: PassportIcon, review: StarIcon };

/** Service 8 — trip reminders (before arrival, before departure, before the visa expires). */
export function NotificationsView() {
  const { t, locale } = useApp();
  const m = t.account.notifications;
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState(false);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return setError(true);
      const data = (await res.json()) as { notifications: AppNotification[]; unread: number };
      setItems(data.notifications);
      // Shown once as new, then read.
      if (data.unread) {
        await fetch("/api/notifications", { method: "POST" });
        window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
      }
    })().catch(() => setError(true));
  }, []);

  async function remove(id: string) {
    const res = await fetch(`/api/notifications/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) return setError(true);
    setItems((cur) => cur?.filter((n) => n.id !== id) ?? null);
    setDeleted(true);
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href={`/${locale}/account`} label={t.account.title} className="-ms-2.5" />
      <div>
        <h1 className="text-2xl font-bold">{m.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{m.intro}</p>
      </div>
      {error && <Alert tone="error">{t.review.errors.generic}</Alert>}
      {deleted && <Alert tone="success">{m.deleted}</Alert>}
      {items?.some((n) => n.demo) && <Alert tone="info">{m.demoHint}</Alert>}
      {!items && !error ? (
        <div className="grid min-h-[30vh] place-items-center text-brand-700"><Spinner className="size-8" /></div>
      ) : items?.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500" data-testid="notifications-empty">{m.empty}</Card>
      ) : (
        <ul className="space-y-3" data-testid="notifications">
          {items?.map((n) => {
            const Icon = ICON[n.kind];
            const lines = locale === "ar" ? n.linesAr : n.linesEn;
            return (
              <li key={n.id}>
                <Card className={cx("p-4 sm:p-5", !n.readAt && "ring-2 ring-gold-500/60")} data-testid={`notification-${n.kind}`}>
                  <div className="flex items-start gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon className="size-5" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold text-brand-700">{m.kinds[n.kind]}</span>
                        <span>{fmtKsa(n.createdAt, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                        {!n.readAt && <Badge tone="gold">{m.unread}</Badge>}
                        {n.demo && <Badge tone="slate">{m.demo}</Badge>}
                      </div>
                      <h2 className="mt-1 font-bold text-ink">{locale === "ar" ? n.titleAr : n.titleEn}</h2>
                      <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-700">
                        {lines.map((l, i) => <li key={i}>{l}</li>)}
                      </ul>
                      <Link href={`/${locale}${n.href}`} className="mt-3 inline-block text-sm font-semibold text-brand-700 underline">{m.open}</Link>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(n.id)}
                      aria-label={m.delete}
                      title={m.delete}
                      data-testid="notification-delete"
                      className="grid size-9 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <TrashIcon className="size-4" />
                    </button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
