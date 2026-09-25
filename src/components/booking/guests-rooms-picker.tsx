"use client";

import { useEffect, useId, useRef, useState } from "react";
import { fmt } from "@/i18n";
import { PACKAGE_LIMITS } from "@/lib/config";
import { adultsOf, minorsOf, ROOM_LIMITS, travellersOf } from "@/lib/occupancy";
import type { RoomOccupancy } from "@/lib/types";
import { useApp } from "../app-provider";
import { HotelIcon, UsersIcon, XIcon } from "../icons";
import { Button, cx, Select } from "../ui";
import { ageLabel } from "./traveller-label";

/** An unanswered child age (the user must choose one). */
export const AGE_UNSET = -1;

const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

/**
 * "Guests and rooms": adults (18+) and children (0–17) per room, with each child's age. Ages set
 * the airline fare category and the package's adults/minors; rooms are what hotels are booked for.
 */
export function GuestsRoomsPicker({ id, value, onChange, invalid }: {
  id?: string;
  value: RoomOccupancy[];
  onChange: (rooms: RoomOccupancy[]) => void;
  invalid?: boolean;
}) {
  const { t } = useApp();
  const g = t.search.guests;
  const [open, setOpen] = useState(false);
  const uid = useId();
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const totalAdults = adultsOf(value);
  const totalMinors = minorsOf(value);
  const update = (i: number, room: RoomOccupancy) => onChange(value.map((r, j) => (j === i ? room : r)));
  const setAdults = (i: number, n: number) => update(i, { ...value[i], adults: n });
  const setChildren = (i: number, n: number) => {
    const ages = value[i].childAges.slice(0, n);
    while (ages.length < n) ages.push(AGE_UNSET);
    update(i, { ...value[i], childAges: ages });
  };
  const setAge = (i: number, k: number, age: number) =>
    update(i, { ...value[i], childAges: value[i].childAges.map((a, j) => (j === k ? age : a)) });
  const canAddRoom = value.length < ROOM_LIMITS.maxRooms && totalAdults < PACKAGE_LIMITS.maxAdults;
  const summary = fmt(g.summary, { rooms: value.length, n: travellersOf(value) });

  return (
    <div ref={wrapper} className="relative">
      <button
        id={id}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className={cx(
          "flex h-11 w-full items-center gap-2 rounded-lg border bg-white px-3 text-start text-sm text-ink transition focus:outline-none focus:ring-2 focus:ring-brand-500/30",
          invalid ? "border-red-400" : "border-slate-300 focus:border-brand-500",
        )}
      >
        <UsersIcon className="size-4 shrink-0 text-brand-700" />
        <span className="min-w-0 flex-1 truncate font-medium">{summary}</span>
        <svg viewBox="0 0 20 20" className={cx("size-4 shrink-0 text-slate-500 transition", open && "rotate-180")} aria-hidden>
          <path fill="currentColor" d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z" />
        </svg>
      </button>

      {open && (
        <div role="dialog" aria-label={g.select} className="absolute start-0 top-full z-30 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:w-[40rem] sm:max-w-[calc(100vw-2rem)]">
          <div className="flex items-center justify-between bg-slate-100 px-4 py-2.5">
            <p className="text-sm font-bold text-ink">{g.select}</p>
            <button type="button" onClick={() => setOpen(false)} aria-label={t.common.close} className="grid size-7 place-items-center rounded-full bg-brand-700 text-white hover:bg-brand-800">
              <XIcon className="size-4" />
            </button>
          </div>

          <div className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
            {value.map((room, i) => {
              const adultsMax = Math.min(ROOM_LIMITS.maxAdultsPerRoom, PACKAGE_LIMITS.maxAdults - (totalAdults - room.adults));
              const childrenMax = Math.min(ROOM_LIMITS.maxChildrenPerRoom, PACKAGE_LIMITS.maxMinors - (totalMinors - room.childAges.length));
              return (
                <div key={i} className="px-4 py-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <p className="flex h-10 items-center gap-2 text-sm font-bold text-ink sm:w-24">
                      <HotelIcon className="size-5 text-brand-700" />
                      {fmt(g.room, { n: i + 1 })}
                    </p>
                    <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                      {g.adults}
                      <Select id={`${uid}-r${i}-adults`} className="h-10 w-28" value={room.adults} onChange={(e) => setAdults(i, Number(e.target.value))} aria-label={`${fmt(g.room, { n: i + 1 })} — ${g.adults}`}>
                        {range(1, adultsMax).map((n) => <option key={n} value={n}>{fmt(g.adultsN, { n })}</option>)}
                      </Select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                      {g.children}
                      <Select id={`${uid}-r${i}-children`} className="h-10 w-28" value={room.childAges.length} onChange={(e) => setChildren(i, Number(e.target.value))} aria-label={`${fmt(g.room, { n: i + 1 })} — ${g.children}`}>
                        {range(0, childrenMax).map((n) => <option key={n} value={n}>{fmt(g.childrenN, { n })}</option>)}
                      </Select>
                    </label>
                    {value.length > 1 && (
                      <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="ms-auto h-10 rounded-lg px-3 text-xs font-semibold text-red-700 hover:bg-red-50">
                        {g.removeRoom}
                      </button>
                    )}
                  </div>
                  {room.childAges.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:ms-24 sm:grid-cols-3">
                      {room.childAges.map((age, k) => {
                        const missing = age === AGE_UNSET;
                        return (
                          <label key={k} className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                            {fmt(g.childAge, { n: k + 1 })}
                            <Select
                              id={`${uid}-r${i}-age${k}`}
                              className="h-10"
                              value={age}
                              invalid={invalid && missing}
                              onChange={(e) => setAge(i, k, Number(e.target.value))}
                              aria-label={`${fmt(g.room, { n: i + 1 })} — ${fmt(g.childAge, { n: k + 1 })}`}
                            >
                              <option value={AGE_UNSET} disabled>{g.chooseAge}</option>
                              {range(0, ROOM_LIMITS.maxChildAge).map((a) => (
                                <option key={a} value={a}>{ageLabel(t, a)}</option>
                              ))}
                            </Select>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              disabled={!canAddRoom}
              onClick={() => onChange([...value, { adults: 1, childAges: [] }])}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-brand-800 ring-1 ring-inset ring-brand-700/30 hover:bg-brand-50 disabled:opacity-40"
            >
              <span className="grid size-5 place-items-center rounded-full bg-brand-700 text-sm leading-none text-white">+</span>
              {g.addRoom}
            </button>
            <Button type="button" size="sm" onClick={() => setOpen(false)}>{g.done}</Button>
          </div>
          <p className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] leading-relaxed text-slate-500">{g.hint}</p>
        </div>
      )}
    </div>
  );
}
