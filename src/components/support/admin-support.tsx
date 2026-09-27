"use client";

import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { cityName } from "@/lib/data/cities";
import { countryName } from "@/lib/data/countries";
import { fmtKsa } from "@/lib/events/format";
import type { AdminTicketRow } from "@/lib/support/tickets";
import type { PublicTicket } from "@/lib/support/types";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { Alert, Badge, Button, Card, cx, Spinner } from "../ui";
import { Composer, Conversation, type Attachment } from "./conversation";
import { STATUS_TONE } from "./support-center";

type Detail = {
  ticket: PublicTicket;
  traveller: { name: string; email: string; nationality: string | null };
  booking: { id: string; reference: string; status: string; departureDate: string; returnDate: string; cities: string[]; travellers: number; totalSAR: number } | null;
};
const FILTERS = ["open", "waiting", "closed", "all"] as const;

/** Back office — support tickets: queue, conversation (translated), reply, assign, status. */
export function AdminSupport() {
  const { t, locale, money } = useApp();
  const s = t.support;
  const a = s.admin;
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("open");
  const [highOnly, setHighOnly] = useState(false);
  const [mine, setMine] = useState(false);
  const [list, setList] = useState<{ tickets: AdminTicketRow[]; counts: { open: number; waiting: number; high: number }; me: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState({ key: 0, text: "" });

  const loadList = useCallback(async () => {
    const r = await fetch(`/api/admin/support?status=${filter}${highOnly ? "&priority=high" : ""}${mine ? "&mine=1" : ""}`, { cache: "no-store" });
    if (r.ok) setList(await r.json());
  }, [filter, highOnly, mine]);
  const loadDetail = useCallback(async (id: string) => {
    const r = await fetch(`/api/admin/support/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (r.ok) setDetail(await r.json());
  }, []);
  useEffect(() => {
    void loadList();
  }, [loadList]);
  useEffect(() => {
    if (selected) void loadDetail(selected);
  }, [selected, loadDetail]);

  async function act(method: "POST" | "PATCH", body: Record<string, unknown>): Promise<boolean> {
    if (!selected) return false;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/admin/support/${encodeURIComponent(selected)}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) {
        setErr(s.errors.generic);
        return false;
      }
      await Promise.all([loadDetail(selected), loadList()]);
      return true;
    } finally {
      setBusy(false);
    }
  }

  const tk = detail?.ticket;
  return (
    <div className="space-y-5">
      <BackLink href={`/${locale}/admin`} label={t.admin.nav} className="-ms-2.5" />
      <div>
        <h1 className="text-2xl font-bold">{a.title}</h1>
        <p className="mt-1 max-w-4xl text-sm text-slate-600">{a.intro}</p>
        {list && <p className="mt-2 text-sm font-semibold text-slate-700" data-testid="support-counts">{fmt(a.counts, list.counts)}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
            className={cx("h-9 rounded-full px-4 text-sm font-semibold", filter === f ? "bg-brand-800 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50")}>
            {a.filters[f]}
          </button>
        ))}
        <label className="ms-2 flex items-center gap-1.5 text-sm"><input type="checkbox" className="accent-brand-700" checked={highOnly} onChange={(e) => setHighOnly(e.target.checked)} />{a.highOnly}</label>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="accent-brand-700" checked={mine} onChange={(e) => setMine(e.target.checked)} />{a.mine}</label>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="h-fit overflow-hidden" data-testid="support-queue">
          {!list ? (
            <div className="grid h-32 place-items-center text-brand-700"><Spinner className="size-6" /></div>
          ) : list.tickets.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">{a.empty}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {list.tickets.map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => setSelected(row.id)} className={cx("w-full p-3 text-start hover:bg-slate-50", selected === row.id && "bg-brand-50")} data-testid="queue-row">
                    <span className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span><span className="ltr-nums">{row.number}</span> · {t.translate.languages[row.lang]}</span>
                      <span className="flex gap-1">
                        {row.priority === "high" && <Badge tone="red">{s.priority.high}</Badge>}
                        <Badge tone={STATUS_TONE[row.status]}>{s.status[row.status]}</Badge>
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-sm font-semibold text-ink" dir="auto">{row.subject}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500" dir="auto">{row.userName}: {row.lastMessage.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="min-w-0">
          {!selected ? (
            <Card className="p-8 text-center text-sm text-slate-500">{a.select}</Card>
          ) : !detail || !tk ? (
            <div className="grid h-40 place-items-center text-brand-700"><Spinner className="size-6" /></div>
          ) : (
            <div className="space-y-4" data-testid="support-detail">
              <Card className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-500"><span className="ltr-nums">{tk.number}</span> · {s.categories[tk.category]} · {fmtKsa(tk.createdAt, locale, { dateStyle: "medium", timeStyle: "short" })}</p>
                    <h2 className="text-lg font-bold" dir="auto">{tk.subject}</h2>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tk.demo && <Badge>{s.sample}</Badge>}
                    <Badge tone={tk.priority === "high" ? "red" : "slate"}>{s.priority[tk.priority]}</Badge>
                    <Badge tone={STATUS_TONE[tk.status]}>{s.status[tk.status]}</Badge>
                  </div>
                </div>
                <dl className="grid gap-2 text-sm sm:grid-cols-3">
                  <div><dt className="text-xs text-slate-500">{a.traveller}</dt><dd className="font-semibold">{detail.traveller.name}</dd><dd className="text-xs text-slate-500">{detail.traveller.email}{detail.traveller.nationality ? ` · ${countryName(detail.traveller.nationality, locale)}` : ""}</dd></div>
                  <div><dt className="text-xs text-slate-500">{a.language}</dt><dd className="font-semibold">{t.translate.languages[tk.lang]}</dd></div>
                  <div>
                    <dt className="text-xs text-slate-500">{a.bookingInfo}</dt>
                    {detail.booking ? (
                      <dd className="text-xs">
                        <b className="ltr-nums">{detail.booking.reference}</b> · {detail.booking.cities.map((c) => cityName(c, locale)).join("، ")}<br />
                        <span className="ltr-nums">{detail.booking.departureDate} → {detail.booking.returnDate}</span> · {detail.booking.travellers} · {money(detail.booking.totalSAR)}
                      </dd>
                    ) : <dd>—</dd>}
                  </div>
                </dl>
                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 text-sm">
                  <span className="self-center text-xs text-slate-500">{tk.assignedTo ? fmt(a.assigned, { who: tk.assignedTo }) : a.unassigned}</span>
                  {tk.assignedTo !== list?.me ? (
                    <Button size="sm" variant="secondary" onClick={() => void act("PATCH", { assignedTo: list?.me })} data-testid="assign-me">{a.assign}</Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => void act("PATCH", { assignedTo: null })}>{a.unassign}</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => void act("PATCH", { priority: tk.priority === "high" ? "normal" : "high" })}>{tk.priority === "high" ? a.markNormal : a.markHigh}</Button>
                  {tk.status === "closed"
                    ? <Button size="sm" variant="ghost" onClick={() => void act("PATCH", { status: "open" })}>{a.reopen}</Button>
                    : <Button size="sm" variant="ghost" onClick={() => void act("PATCH", { status: "closed" })}>{a.closeTicket}</Button>}
                </div>
              </Card>
              <Card className="bg-slate-50/60 p-4">
                <Conversation key={tk.id + tk.messages.length} ticket={tk} viewer="staff" />
                {tk.lang !== "ar" && tk.messages.some((m) => m.from === "traveller" && !m.translation) && <p className="mt-3 text-xs text-amber-700">{a.noTranslation}</p>}
              </Card>
              {err && <Alert tone="error">{err}</Alert>}
              <Card className="space-y-3 p-4">
                <div className="flex flex-wrap gap-2">
                  <span className="self-center text-xs font-semibold text-slate-500">{a.canned}:</span>
                  {a.cannedList.map((c, i) => (
                    <button key={i} type="button" onClick={() => setDraft((d) => ({ key: d.key + 1, text: c }))} className="max-w-xs truncate rounded-full bg-slate-100 px-3 py-1 text-xs hover:bg-slate-200" title={c} data-testid="canned">{c}</button>
                  ))}
                </div>
                <Composer
                  key={`${tk.id}-${draft.key}`}
                  initial={draft.text}
                  onSend={(message: string, attachments: Attachment[], opts) => act("POST", { message, attachments, close: !!opts?.close })}
                  placeholder={a.replyPlaceholder}
                  busy={busy}
                  testId="staff-composer"
                  extra={(send) => <Button type="button" variant="secondary" onClick={() => send({ close: true })} data-testid="send-close">{a.sendClose}</Button>}
                />
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
