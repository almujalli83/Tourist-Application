"use client";

import { fmt } from "@/i18n";
import type { EsimKind, EsimPlan } from "@/lib/esim/tygo";
import { useApp } from "../app-provider";
import { CheckIcon, PhoneIcon } from "../icons";
import { Alert, Badge, cx } from "../ui";

const COMPAT_URL = "https://www.gsma.com/solutions-and-impact/technologies/esim/";

/** Tygo plan picker: kind tabs (data / data + Saudi number) and plan cards; a plan covering the trip is suggested. */
export function EsimPlanPicker({ plans, kind, onKind, selectedId, onSelect, tripDays }: {
  plans: EsimPlan[]; kind: EsimKind; onKind: (k: EsimKind) => void; selectedId: string | null; onSelect: (p: EsimPlan) => void; tripDays: number | null;
}) {
  const { t, money } = useApp();
  const e = t.esim;
  const list = plans.filter((p) => p.kind === kind).sort((a, b) => a.days - b.days || a.priceSAR - b.priceSAR);
  const suggested = tripDays ? (list.filter((p) => p.dataGB !== null).find((p) => p.days >= tripDays) ?? list.filter((p) => p.dataGB !== null).at(-1)) : null;

  return (
    <div className="space-y-4">
      <Alert tone="info">
        <p className="font-semibold">{e.compatTitle}</p>
        <p className="mt-1 text-xs">{e.compatBody} <a href={COMPAT_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline">{e.compatLink}</a></p>
      </Alert>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
        {(["data", "dataVoice"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => onKind(k)}
            className={cx("h-10 rounded-md text-sm font-semibold", kind === k ? "bg-white text-brand-800 shadow-sm" : "text-slate-600")}>
            {e.kinds[k]}
          </button>
        ))}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2" data-testid="esim-plans">
        {list.map((p) => {
          const on = p.id === selectedId;
          return (
            <li key={p.id}>
              <button type="button" onClick={() => onSelect(p)} aria-pressed={on} data-plan={p.id}
                className={cx("flex h-full w-full flex-col rounded-xl border p-4 text-start transition", on ? "border-brand-600 bg-brand-50 ring-2 ring-brand-600/50" : "border-slate-200 bg-white hover:border-brand-400")}>
                <div className="flex w-full items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold">{p.dataGB === null ? e.unlimited : fmt(e.dataGB, { n: p.dataGB })}</p>
                    <p className="text-sm text-slate-600">{fmt(e.days, { n: p.days })}</p>
                  </div>
                  <p className="ltr-nums text-lg font-bold text-brand-800">{money(p.priceSAR)}<span className="block text-end text-[11px] font-normal text-slate-500">{e.perEsim}</span></p>
                </div>
                {p.kind === "dataVoice" && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600"><PhoneIcon className="size-3.5" />{e.localNumber} · {fmt(e.minutes, { n: p.minutes })}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {suggested?.id === p.id && tripDays && <Badge tone="gold">{fmt(e.suggested, { n: tripDays })}</Badge>}
                  <Badge tone={p.refundableBeforeActivation ? "brand" : "slate"}>{p.refundableBeforeActivation ? e.refundable : e.final}</Badge>
                  {on && <Badge tone="brand"><CheckIcon className="size-3" />{e.selected}</Badge>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
