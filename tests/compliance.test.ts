import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.cookies.has(n) ? { name: n, value: jar.cookies.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.cookies.set(n, v),
    delete: (n: string) => void jar.cookies.delete(n),
  }),
  headers: async () => new Headers(),
}));

import { randomUUID } from "node:crypto";
import { GET as securityTxt } from "@/app/.well-known/security.txt/route";
import { POST as ackRoute } from "@/app/api/account/privacy/route";
import { login } from "@/lib/auth/account";
import { hashPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { aiConfigured } from "@/lib/assistant/claude";
import { audit, idOfSeq, listAudit, verifyAuditLog, type AuditEntry } from "@/lib/compliance/audit";
import { needsPrivacyAck, PRIVACY_VERSION, type ConsentDoc } from "@/lib/compliance/consent";
import { authorityDeadline, createIncident, IncidentError, listIncidents, updateIncident } from "@/lib/compliance/incidents";
import { auditedRequest } from "@/lib/compliance/request-audit";
import { crossBorderAllowed, dataFlows, residencyMode } from "@/lib/compliance/residency";
import { auditRetentionDays, lastRetentionRun, runRetention } from "@/lib/compliance/retention";
import { blobConfigured } from "@/lib/files";
import { handle, json } from "@/lib/http";
import { createUser, getUserById } from "@/lib/repo";
import { store } from "@/lib/store";
import nextConfig from "../next.config";

// Next passes the request to every handler; the route itself takes no arguments.
const ackPrivacy = ackRoute as unknown as (req: Request) => Promise<Response>;

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
  jar.cookies.clear();
});

async function clearAudit() {
  for (const { id } of await store().entries("auditLog")) await store().delete("auditLog", id);
  await store().delete("config", "auditHead");
}

describe("audit log", () => {
  beforeEach(clearAudit);

  it("chains entries and verifies them", async () => {
    await audit({ action: "a1", role: "system" });
    await audit({ action: "a2", role: "admin", actorEmail: "boss@example.com", status: 200, ip: "10.1.1.1" });
    await audit({ action: "a3", role: "user", actorId: "u1" });
    const v = await verifyAuditLog();
    expect(v).toMatchObject({ ok: true, count: 3, firstSeq: 1, lastSeq: 3 });
    const [latest] = await listAudit();
    expect(latest.action).toBe("a3");
    expect((await listAudit({ actor: "boss@" })).map((e) => e.action)).toEqual(["a2"]);
  });

  it("detects an altered, a removed and a trailing removed entry", async () => {
    for (const a of ["a1", "a2", "a3", "a4"]) await audit({ action: a, role: "system" });
    await store().update<AuditEntry>("auditLog", idOfSeq(2), (e) => ({ ...e, actorEmail: "someone-else@example.com" }));
    expect((await verifyAuditLog()).altered).toEqual([2]);
    await store().delete("auditLog", idOfSeq(3));
    expect((await verifyAuditLog()).missing).toEqual([3]);
    await store().delete("auditLog", idOfSeq(4));
    expect((await verifyAuditLog()).headMismatch).toBe(true);
  });

  it("stays valid when the oldest entries are removed by retention", async () => {
    await audit({ action: "old", role: "system" }, new Date(Date.now() - (auditRetentionDays() + 5) * 86_400_000));
    await audit({ action: "new", role: "system" });
    await runRetention();
    const v = await verifyAuditLog();
    expect(v).toMatchObject({ ok: true, count: 1, firstSeq: 2 });
  });

  it("records sensitive API requests through handle(), with the outcome", async () => {
    expect(auditedRequest("GET", "/api/admin/operations")).toBe(true);
    expect(auditedRequest("GET", "/api/account/sessions")).toBe(false);
    expect(auditedRequest("GET", "/api/account/export")).toBe(true);
    expect(auditedRequest("POST", "/api/account/password")).toBe(true);
    expect(auditedRequest("GET", "/api/events")).toBe(false);
    const route = handle(async (req: Request) => json({ error: "forbidden", path: new URL(req.url).pathname }, 403));
    await route(new Request("http://localhost/api/admin/operations", { headers: { "x-forwarded-for": "203.0.113.9", "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130" } }));
    await handle(async (req: Request) => json({ ok: !!req }))(new Request("http://localhost/api/events"));
    const [e] = await listAudit();
    expect(e).toMatchObject({ action: "GET /api/admin/operations", role: "anonymous", status: 403, ip: "203.0.113.9" });
    expect((await listAudit()).length).toBe(1);
  });

  it("records sign-ins and failed attempts", async () => {
    const email = `u-${randomUUID()}@example.com`;
    await createUser({ id: randomUUID(), email, passwordHash: await hashPassword("Correct-horse-9"), hasPassword: true, accountType: "individual", preferredLocale: "en", preferredCurrency: "SAR", createdAt: new Date().toISOString() });
    const req = () => new Request("http://localhost/api/auth/login", { headers: { "x-forwarded-for": "198.51.100.7" } });
    await expect(login({ email, password: "wrong-password" }, req())).rejects.toThrow();
    await login({ email, password: "Correct-horse-9" }, req());
    const actions = (await listAudit({ actor: email })).map((e) => e.action);
    expect(actions).toEqual(["signin.password", "signin.failed"]);
  });
});

describe("retention", () => {
  it("deletes records past their period and keeps the rest", async () => {
    const s = store();
    const old = new Date(Date.now() - 400 * 86_400_000).toISOString();
    const recent = new Date().toISOString();
    await s.put("sessions", "s-old", { id: "s-old", userId: "u", expiresAt: old });
    await s.put("sessions", "s-new", { id: "s-new", userId: "u", expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
    await s.put("chats", "c-old", { id: "c-old", userId: "u", messages: [], updatedAt: old });
    await s.put("outbox", "o-new", { id: "o-new", createdAt: recent });
    await s.put("aiUsage", "2020-01-01|ip:x", { id: "2020-01-01|ip:x", count: 3 });
    const run = await runRetention();
    expect(run.deleted.sessions).toBeGreaterThanOrEqual(1);
    expect(await s.get("sessions", "s-old")).toBeNull();
    expect(await s.get("sessions", "s-new")).not.toBeNull();
    expect(await s.get("chats", "c-old")).toBeNull();
    expect(await s.get("outbox", "o-new")).not.toBeNull();
    expect(await s.get("aiUsage", "2020-01-01|ip:x")).toBeNull();
    expect((await lastRetentionRun())?.total).toBe(run.total);
  });

  it("keeps audit logs at least a year", () => {
    process.env.AUDIT_RETENTION_DAYS = "30";
    expect(auditRetentionDays()).toBe(365);
    process.env.AUDIT_RETENTION_DAYS = "1000";
    expect(auditRetentionDays()).toBe(1000);
  });
});

describe("privacy notice", () => {
  it("records the acknowledgement at sign-up and again from the banner", async () => {
    const id = randomUUID();
    const u = await createUser({ id, email: `p-${id}@example.com`, passwordHash: "", hasPassword: false, accountType: "individual", preferredLocale: "ar", preferredCurrency: "SAR", createdAt: new Date().toISOString() });
    expect(u?.privacy?.version).toBe(PRIVACY_VERSION);
    expect(needsPrivacyAck(u)).toBe(false);
    expect(needsPrivacyAck({ privacy: { version: "2000-01" } })).toBe(true);
    expect(needsPrivacyAck({})).toBe(true);
    await setSessionCookie(id);
    const res = await ackPrivacy(new Request("http://localhost/api/account/privacy", { method: "POST" }));
    expect(res.status).toBe(200);
    const doc = await store().get<ConsentDoc>("consents", id);
    expect(doc?.events.map((e) => e.method)).toEqual(["signup", "banner"]);
    expect((await getUserById(id))?.privacy?.version).toBe(PRIVACY_VERSION);
  });

  it("requires a signed-in user", async () => {
    expect((await ackPrivacy(new Request("http://localhost/api/account/privacy", { method: "POST" }))).status).toBe(401);
  });
});

describe("incidents", () => {
  it("validates, tracks the 72-hour deadline and notifications", async () => {
    await expect(createIncident({ title: "", severity: "high" }, "a@x")).rejects.toThrow(IncidentError);
    await expect(createIncident({ title: "x", severity: "extreme" }, "a@x")).rejects.toThrow(IncidentError);
    await expect(createIncident({ title: "x", severity: "low", detectedAt: new Date(Date.now() + 3_600_000).toISOString() }, "a@x")).rejects.toThrow(IncidentError);
    const detectedAt = new Date(Date.now() - 80 * 3_600_000).toISOString();
    const i = await createIncident({ title: "Leaked export", severity: "high", personalData: true, affected: 12, detectedAt }, "admin@x");
    expect(authorityDeadline(i)!.hoursLeft).toBeLessThan(0);
    expect(authorityDeadline({ ...i, personalData: false })).toBeNull();
    const fresh = await createIncident({ title: "Phishing", severity: "medium", personalData: true }, "admin@x");
    expect(authorityDeadline(fresh)!.hoursLeft).toBeGreaterThanOrEqual(71);
    const u = await updateIncident(i.id, { authorityNotified: true, status: "contained", note: "Reported to SDAIA" }, "admin@x");
    expect(u?.authorityNotifiedAt).toBeTruthy();
    expect(u?.notes[0].text).toBe("Reported to SDAIA");
    expect(authorityDeadline(u!)).toBeNull();
    await expect(updateIncident(i.id, { status: "gone" }, "admin@x")).rejects.toThrow(IncidentError);
    const closed = await updateIncident(i.id, { status: "closed" }, "admin@x");
    expect(closed?.closedAt).toBeTruthy();
    expect((await listIncidents()).some((x) => x.id === fresh.id && x.deadline)).toBe(true);
  });
});

describe("data residency", () => {
  it("switches off cross-border services in the Kingdom mode unless allowed", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    process.env.BLOB_READ_WRITE_TOKEN = "blob-token";
    expect(residencyMode()).toBe("open");
    expect(aiConfigured()).toBe(true);
    expect(blobConfigured()).toBe(true);
    process.env.DATA_RESIDENCY = "ksa";
    expect(aiConfigured()).toBe(false);
    expect(blobConfigured()).toBe(false);
    expect(crossBorderAllowed("translate")).toBe(false);
    process.env.CROSS_BORDER_ALLOW = "ai";
    expect(aiConfigured()).toBe(true);
    expect(blobConfigured()).toBe(false);
    const flows = dataFlows();
    expect(flows.mode).toBe("ksa");
    expect(flows.services.find((s) => s.key === "blob")).toMatchObject({ configured: true, active: false });
  });

  it("reports the database host without credentials", () => {
    process.env.DATABASE_URL = "postgres://user:secret@db.riyadh.example.sa:5432/app";
    const flows = JSON.stringify(dataFlows());
    expect(flows).toContain("db.riyadh.example.sa");
    expect(flows).not.toContain("secret");
  });
});

describe("security headers and disclosure", () => {
  it("sends a CSP and the standard security headers on every path", async () => {
    const rules = await nextConfig.headers!();
    const h = Object.fromEntries(rules.flatMap((r) => r.headers.map((x) => [x.key, x.value])));
    expect(rules[0].source).toBe("/:path*");
    // The CSP rule covers every path except the sandboxed SVG logos, which set a stricter one.
    const csp = rules.find((r) => r.headers.some((x) => x.key === "Content-Security-Policy"))!;
    const pattern = new RegExp(`^${csp.source.replace("/:path", "/")}$`);
    expect(["/", "/ar", "/ar/hotels", "/api/rentals"].every((p) => pattern.test(p))).toBe(true);
    expect(pattern.test("/api/rentals/logo/avis")).toBe(false);
    expect(h["Content-Security-Policy"]).toMatch(/frame-ancestors 'self'/);
    expect(h["Content-Security-Policy"]).toMatch(/object-src 'none'/);
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d{8}/);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("publishes security.txt", async () => {
    process.env.SECURITY_CONTACT = "security@example.sa";
    const text = await securityTxt(new Request("https://trip.example.sa/.well-known/security.txt")).text();
    expect(text).toContain("Contact: mailto:security@example.sa");
    expect(text).toMatch(/Expires: \d{4}-/);
    expect(text).toContain("Policy: https://trip.example.sa/en/privacy");
  });
});
