/**
 * Saudi Arabia Railways (SAR) adapter: trip search, coach seat maps, ticket issue and cancel.
 *
 * Until the SAR integration is connected, the sandbox timetable below is served (departures
 * from each end of every line, fares by journey length, part of the seats already sold). The
 * rest of the app only uses the functions exported here, so connecting SAR means replacing them.
 */
import { createHash, randomBytes } from "node:crypto";
import { LINES, stationByCode, type Line, type LineId } from "./network";

export type TrainClass = "economy" | "business";
export type PassengerType = "adult" | "child";

export interface Fare { adult: number; child: number }

export interface TrainTrip {
  /** `${runId}:${from}-${to}` */
  id: string;
  /** One train on one day; seats are held per run. */
  runId: string;
  lineId: LineId;
  trainNo: string;
  from: string;
  to: string;
  depart: string; // ISO UTC
  arrive: string; // ISO UTC
  durationMins: number;
  fares: Record<TrainClass, Fare>;
}

export interface Coach {
  id: string;
  cls: TrainClass;
  rows: number;
  /** Seat letters; the aisle comes after `aisleAfter` letters. */
  letters: string[];
  aisleAfter: number;
}

export const COACHES: Coach[] = [
  { id: "C1", cls: "business", rows: 10, letters: ["A", "B", "C"], aisleAfter: 1 },
  { id: "C2", cls: "economy", rows: 15, letters: ["A", "B", "C", "D"], aisleAfter: 2 },
  { id: "C3", cls: "economy", rows: 15, letters: ["A", "B", "C", "D"], aisleAfter: 2 },
  { id: "C4", cls: "economy", rows: 15, letters: ["A", "B", "C", "D"], aisleAfter: 2 },
];

export const CHILD_FARE_RATIO = 0.5;
const SEARCH_DAYS_AHEAD = 90;

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const ksaDay = (iso: string) => new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(0, 10);

function fareFor(mins: number): Record<TrainClass, Fare> {
  const eco = Math.round((40 + 0.8 * mins) / 5) * 5;
  const bus = Math.round((eco * 1.8) / 5) * 5;
  const f = (adult: number) => ({ adult, child: Math.round(adult * CHILD_FARE_RATIO) });
  return { economy: f(eco), business: f(bus) };
}

function tripOf(line: Line, forward: boolean, depIndex: number, terminusDay: string, from: string, to: string): TrainTrip | null {
  const stops = forward ? line.stops : [...line.stops].reverse().map((s) => ({ code: s.code, min: line.stops[line.stops.length - 1].min - s.min }));
  const a = stops.find((s) => s.code === from);
  const b = stops.find((s) => s.code === to);
  if (!a || !b || a.min >= b.min) return null;
  const time = line.departures[depIndex];
  const start = Date.parse(`${terminusDay}T${time}:00+03:00`);
  const trainNo = `${line.id === "haramain" ? "HHR" : line.id === "north" ? "N" : "E"}${forward ? 1 : 2}${String(depIndex + 1).padStart(2, "0")}`;
  const runId = `${trainNo}-${terminusDay.replace(/-/g, "")}`;
  const depart = new Date(start + a.min * 60_000).toISOString();
  return {
    id: `${runId}:${from}-${to}`, runId, lineId: line.id, trainNo, from, to, depart,
    arrive: new Date(start + b.min * 60_000).toISOString(), durationMins: b.min - a.min, fares: fareFor(b.min - a.min),
  };
}

/** Trips from `from` to `to` departing on `day` (Saudi date), in time order. */
export function searchTrips(from: string, to: string, day: string, today: string): TrainTrip[] {
  const a = stationByCode(from);
  const b = stationByCode(to);
  if (!a || !b || a.line !== b.line || a.code === b.code) return [];
  if (day < today || day > addDays(today, SEARCH_DAYS_AHEAD)) return [];
  const line = LINES.find((l) => l.id === a.line)!;
  const out: TrainTrip[] = [];
  // A train that left its first station the evening before can reach `from` on `day`.
  for (const terminusDay of [addDays(day, -1), day]) {
    for (const forward of [true, false]) {
      for (let i = 0; i < line.departures.length; i++) {
        const t = tripOf(line, forward, i, terminusDay, from, to);
        if (t && ksaDay(t.depart) === day) out.push(t);
      }
    }
  }
  return out.sort((x, y) => x.depart.localeCompare(y.depart));
}

/** Rebuilds a trip from its id (validated against the timetable). */
export function tripById(id: string): TrainTrip | null {
  const m = /^((HHR|N|E)([12])(\d{2}))-(\d{8}):([A-Z]{3})-([A-Z]{3})$/.exec(id);
  if (!m) return null;
  const line = LINES.find((l) => (m[2] === "HHR" ? l.id === "haramain" : m[2] === "N" ? l.id === "north" : l.id === "east"))!;
  const idx = Number(m[4]) - 1;
  if (idx < 0 || idx >= line.departures.length) return null;
  const day = `${m[5].slice(0, 4)}-${m[5].slice(4, 6)}-${m[5].slice(6)}`;
  const t = tripOf(line, m[3] === "1", idx, day, m[6], m[7]);
  return t && t.id === id ? t : null;
}

/* -------------------------------------------------------- seats */

const unit = (s: string) => createHash("sha256").update(s).digest().readUInt32BE(0) / 0xffffffff;

export const seatCode = (coach: string, row: number, letter: string) => `${coach}-${row}${letter}`;

export function seatInfo(seat: string): { coach: Coach; row: number; letter: string } | null {
  const m = /^(C\d)-(\d{1,2})([A-D])$/.exec(seat);
  if (!m) return null;
  const coach = COACHES.find((c) => c.id === m[1]);
  const row = Number(m[2]);
  if (!coach || row < 1 || row > coach.rows || !coach.letters.includes(m[3])) return null;
  return { coach, row, letter: m[3] };
}

export function allSeats(cls: TrainClass): string[] {
  return COACHES.filter((c) => c.cls === cls).flatMap((c) => Array.from({ length: c.rows }, (_, r) => c.letters.map((l) => seatCode(c.id, r + 1, l))).flat());
}

/** Seats already sold through SAR's other channels (sandbox: about 30%). */
export const sarSoldSeat = (runId: string, seat: string) => unit(`${runId}|${seat}`) < 0.3;

/* -------------------------------------------------------- policy */

/**
 * Refund share by time left before departure (sandbox rendering of SAR's policy):
 * 24 h or more: 90%; from 1 h: 50%; less than 1 h: none.
 */
export function refundShare(departISO: string, now: Date): number {
  const hours = (Date.parse(departISO) - now.getTime()) / 3_600_000;
  if (hours >= 24) return 0.9;
  if (hours >= 1) return 0.5;
  return 0;
}

/* -------------------------------------------------------- issue / cancel */

export const sarMode = () => "sandbox" as const;

export async function sarIssue(ticketCount: number): Promise<{ pnr: string; codes: string[] }> {
  const code = () => `SAR-${randomBytes(6).toString("hex").toUpperCase()}`;
  return { pnr: randomBytes(3).toString("hex").toUpperCase(), codes: Array.from({ length: ticketCount }, code) };
}

export async function sarCancel(pnr: string): Promise<boolean> {
  return !!pnr;
}
