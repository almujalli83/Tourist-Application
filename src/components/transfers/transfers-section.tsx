"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Direction, PublicTransfer, TransferStatus } from "@/lib/transfers/types";
import { useApp } from "../app-provider";
import { CarIcon } from "../icons";
import { Badge, Button, Card, Spinner } from "../ui";
import { localWhen, TransferRequest } from "./transfer-request";

export const TRANSFER_TONE: Record<TransferStatus, "amber" | "brand" | "red" | "slate"> = { requested: "amber", confirmed: "brand", rejected: "red", cancelled: "red", completed: "slate" };

/** A package's airport pickup and drop-off: the requests made, or a button to request each. */
export function TransfersSection({ bookingId, cancelled }: { bookingId: string; cancelled: boolean }) {
  const { t, locale } = useApp();
  const s = t.transfers;
  const [list, setList] = useState<PublicTransfer[] | null>(null);
  const [open, setOpen] = useState<Direction | null>(null);
  const load = useCallback(() => {
    fetch("/api/transfers", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { transfers: [] })).then((d) => setList((d.transfers as PublicTransfer[]).filter((x) => x.bookingId === bookingId))).catch(() => setList([]));
  }, [bookingId]);
  useEffect(load, [load]);
  if (cancelled) return null;
  return (
    <Card className="space-y-4 p-5" id="transfers" data-testid="transfers-section">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold"><CarIcon className="size-5 text-brand-700" />{s.title}</h2>
        <p className="mt-1 text-sm text-slate-600">{s.intro}</p>
      </div>
      {!list ? (
        <div className="grid h-16 place-items-center text-brand-700"><Spinner className="size-5" /></div>
      ) : (
        (["arrival", "departure"] as const).map((dir) => {
          const current = list.filter((x) => x.direction === dir).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
          const active = current && current.status !== "cancelled" && current.status !== "rejected";
          return (
            <div key={dir} className="rounded-xl border border-slate-200 p-4" data-testid={`transfer-${dir}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{s.direction[dir]}</p>
                {current && (
                  <span className="flex items-center gap-2">
                    <Badge tone={TRANSFER_TONE[current.status]}>{s.status[current.status]}</Badge>
                    <Link href={`/${locale}/account/transfers/${current.id}`} className="text-sm font-semibold text-brand-700 hover:underline">{s.view}</Link>
                  </span>
                )}
              </div>
              {active ? (
                <p className="mt-1 text-sm text-slate-600">
                  {localWhen(current.pickupAt, locale)} · {s.vehicles[current.vehicle]}{current.driver ? ` · ${s.driver}: ${current.driver.name}` : ""}
                </p>
              ) : open === dir ? (
                <div className="mt-3"><TransferRequest source={{ bookingId, direction: dir }} onDone={() => { setOpen(null); load(); }} onCancel={() => setOpen(null)} /></div>
              ) : (
                <Button size="sm" className="mt-2" onClick={() => setOpen(dir)} data-testid={`transfer-open-${dir}`}>
                  {dir === "arrival" ? s.requestArrival : s.requestDeparture}
                </Button>
              )}
            </div>
          );
        })
      )}
    </Card>
  );
}
