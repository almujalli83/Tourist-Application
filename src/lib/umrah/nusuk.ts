/**
 * Nusuk (Ministry of Hajj and Umrah): Umrah and Rawdah permits. The traveller picks a day and time
 * from Nusuk's availability and the permit is issued automatically in their names.
 *
 * - Linked (an agreement provides the API): NUSUK_API_URL (+ NUSUK_API_TOKEN, Bearer). Expected
 *   endpoints, to be matched with the official specification when it is received:
 *     GET    {url}/slots?type=umrah|rawdah&date=YYYY-MM-DD&people=N[&group=men|women]
 *            → [{ id, date, start: "HH:MM", end: "HH:MM", remaining, group? }]
 *     POST   {url}/permits { type, slotId, group?, travellers: [{ passportNo, nationality, nameEn, visaNumber }] }
 *            → { permitNo, qr }
 *     DELETE {url}/permits/{permitNo}
 * - Sandbox (no MT credentials): a simulated Nusuk with limited seats, so the whole flow can be tried.
 * - Otherwise: no automatic issuing; travellers are sent to the Nusuk app (links below).
 */
import { createHash, randomBytes } from "node:crypto";
import { mtConfig } from "../config";
import { store } from "../store";

export const nusukLinks = () => ({
  web: process.env.NUSUK_URL?.trim() || "https://www.nusuk.sa",
  ios: process.env.NUSUK_IOS_URL?.trim() || "https://apps.apple.com/app/nusuk/id6469515422",
  android: process.env.NUSUK_ANDROID_URL?.trim() || "https://play.google.com/store/apps/details?id=com.moh.nusukapp",
});

export type PermitType = "umrah" | "rawdah";
export type RawdahGroup = "men" | "women";

export interface NusukSlot {
  id: string;
  date: string;
  start: string;
  end: string;
  remaining: number;
  group?: RawdahGroup;
}

export interface NusukTraveller { passportNo: string; nationality: string; nameEn: string; visaNumber: string }

export class NusukError extends Error {
  constructor(public code: "unavailable" | "slotFull" | "rejected") {
    super(code);
  }
}

export interface NusukProvider {
  mode: "api" | "sandbox";
  slots(q: { type: PermitType; date: string; people: number; group?: RawdahGroup }): Promise<NusukSlot[]>;
  issue(r: { type: PermitType; slot: NusukSlot; group?: RawdahGroup; travellers: NusukTraveller[] }): Promise<{ permitNo: string; qr: string }>;
  cancel(permitNo: string): Promise<void>;
}

/* ----------------------------------------------------------------- API */

function apiProvider(url: string): NusukProvider {
  const base = url.replace(/\/$/, "");
  const headers = { accept: "application/json", "content-type": "application/json", ...(process.env.NUSUK_API_TOKEN ? { authorization: `Bearer ${process.env.NUSUK_API_TOKEN}` } : {}) };
  const call = async (path: string, init: RequestInit = {}) => {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, { ...init, headers, signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new NusukError("unavailable");
    }
    if (res.status === 409) throw new NusukError("slotFull");
    if (res.status >= 400 && res.status < 500) throw new NusukError("rejected");
    if (!res.ok) throw new NusukError("unavailable");
    return res.status === 204 ? null : ((await res.json().catch(() => null)) as unknown);
  };
  return {
    mode: "api",
    async slots({ type, date, people, group }) {
      const q = new URLSearchParams({ type, date, people: String(people), ...(group ? { group } : {}) });
      const body = await call(`/slots?${q}`);
      const rows = (Array.isArray(body) ? body : ((body as { data?: unknown[] })?.data ?? [])) as Record<string, unknown>[];
      return rows
        .map((r): NusukSlot => ({
          id: String(r.id ?? ""), date: String(r.date ?? "").slice(0, 10), start: String(r.start ?? "").slice(0, 5), end: String(r.end ?? "").slice(0, 5),
          remaining: Number(r.remaining ?? 0), ...(r.group === "men" || r.group === "women" ? { group: r.group as RawdahGroup } : {}),
        }))
        .filter((s) => s.id && s.date === date && /^\d\d:\d\d$/.test(s.start));
    },
    async issue({ type, slot, group, travellers }) {
      const body = (await call("/permits", { method: "POST", body: JSON.stringify({ type, slotId: slot.id, ...(group ? { group } : {}), travellers }) })) as { permitNo?: unknown; qr?: unknown } | null;
      if (!body || typeof body.permitNo !== "string") throw new NusukError("rejected");
      return { permitNo: body.permitNo, qr: typeof body.qr === "string" ? body.qr : body.permitNo };
    },
    async cancel(permitNo) {
      await call(`/permits/${encodeURIComponent(permitNo)}`, { method: "DELETE" });
    },
  };
}

/* ------------------------------------------------------------- sandbox */

const SANDBOX_TIMES: Record<PermitType, { start: string; end: string; group?: RawdahGroup }[]> = {
  umrah: [
    { start: "06:00", end: "08:00" }, { start: "08:00", end: "10:00" }, { start: "10:00", end: "12:00" },
    { start: "16:00", end: "18:00" }, { start: "20:00", end: "22:00" }, { start: "22:00", end: "23:59" },
  ],
  rawdah: [
    { start: "00:30", end: "01:30", group: "men" }, { start: "02:00", end: "03:00", group: "men" }, { start: "21:30", end: "22:30", group: "men" },
    { start: "06:30", end: "07:30", group: "women" }, { start: "08:00", end: "09:00", group: "women" }, { start: "20:00", end: "21:00", group: "women" },
  ],
};

/** Seats of a sandbox slot: stable per slot, some full, to show every case. */
const capacityOf = (id: string) => {
  const n = createHash("sha256").update(id).digest()[0] % 7;
  return n === 0 ? 0 : [0, 4, 8, 12, 20, 30, 40][n];
};

const sandboxProvider: NusukProvider = {
  mode: "sandbox",
  async slots({ type, date, group }) {
    const out: NusukSlot[] = [];
    for (const t of SANDBOX_TIMES[type]) {
      if (type === "rawdah" && t.group !== group) continue;
      const id = `sbx-${type}-${date}-${t.start.replace(":", "")}${t.group ? `-${t.group}` : ""}`;
      const used = (await store().get<{ used: number }>("config", `nusukSandbox:${id}`))?.used ?? 0;
      out.push({ id, date, start: t.start, end: t.end, remaining: Math.max(0, capacityOf(id) - used), ...(t.group ? { group: t.group } : {}) });
    }
    return out;
  },
  async issue({ slot, travellers }) {
    const key = `nusukSandbox:${slot.id}`;
    await store().insert("config", key, { id: key, used: 0 });
    const cap = capacityOf(slot.id);
    let ok = false;
    await store().update<{ id: string; used: number }>("config", key, (d) => {
      ok = d.used + travellers.length <= cap;
      return ok ? { ...d, used: d.used + travellers.length } : d;
    });
    if (!ok) throw new NusukError("slotFull");
    const permitNo = `SBX-${randomBytes(4).toString("hex").toUpperCase()}`;
    return { permitNo, qr: `NUSUK-SANDBOX:${permitNo}` };
  },
  async cancel() {
    /* seats are not given back in the simulation */
  },
};

/** The Nusuk connection in use: the linked API, the sandbox simulation, or none (links only). */
export function nusukProvider(): NusukProvider | null {
  const url = process.env.NUSUK_API_URL?.trim();
  if (url) return apiProvider(url);
  if (mtConfig().mock && process.env.NUSUK_SANDBOX !== "off") return sandboxProvider;
  return null;
}
