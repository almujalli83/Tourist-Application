import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }), headers: async () => new Headers() }));

import { randomUUID } from "node:crypto";
import type { PublicUser } from "@/lib/auth/types";
import { auditedRequest } from "@/lib/compliance/request-audit";
import { addDays, todayISO } from "@/lib/dates";
import { evisaCountries, evisaEligible } from "@/lib/evisa/eligibility";
import { applyForEvisa, evisaFeeSAR, evisaWalletId, getEvisaApplication, listEvisaApplications, validateEvisaTravellers } from "@/lib/evisa/service";
import { walletOverview } from "@/lib/wallet";
import { getAccount } from "@/lib/loyalty/loyalty";
import { store } from "@/lib/store";
import { emptyTraveller } from "@/lib/visa-validation";
import { validAdult } from "./fixtures";

const card = { holder: "JOHN SMITH", number: "4111111111111111", expMonth: "12", expYear: "35", cvc: "123" };
const user = (over: Partial<PublicUser> = {}): PublicUser => ({ id: randomUUID(), email: `ev-${randomUUID()}@example.com`, accountType: "individual", preferredLocale: "en", preferredCurrency: "SAR", createdAt: new Date().toISOString(), ...over }) as PublicUser;
const briton = (over = {}) => validAdult({ nationality: "GB", birthplace: "GB", passportIssuePlace: "GB", firstNameEn: "JOHN", familyNameEn: "SMITH", passportNo: "123456789", mobileNo: "+447700900123", email: "john@example.com", ...over });
const child = () => ({
  ...briton({ firstNameEn: "AMY", passportNo: "987654321", birthDate: addDays(todayISO(), -8 * 365), job: "Student", maritalStatus: "1" as const }),
  paxType: "child" as const, sponsorIndex: 0, companionType: "DAUGHTER",
});
const arrival = () => addDays(todayISO(), 30);

describe("tourist eVisa without a package", () => {
  it("is open to North America, Europe, China, Japan and Korea only", () => {
    for (const c of ["US", "CA", "GB", "FR", "DE", "CN", "JP", "KR"]) expect(evisaEligible(c)).toBe(true);
    for (const c of ["IN", "EG", "PK", "NG", "BR"]) expect(evisaEligible(c)).toBe(false);
    expect(evisaCountries().length).toBeGreaterThan(20);
  });

  it("checks the travellers with the package's visa rules plus the nationality", () => {
    const ok = validateEvisaTravellers([briton()], arrival());
    expect(ok.errors[0]).toEqual({});
    const indian = validateEvisaTravellers([validAdult()], arrival());
    expect(indian.errors[0].nationality).toBe("evisaNotEligible");
    // Same rules as the package: security answers, photo, minors need a sponsor.
    const bad = validateEvisaTravellers([briton({ security: { ...briton().security, beenDeported: "" } }), { ...child(), sponsorIndex: null }], arrival());
    expect(bad.errors[0]["security.beenDeported"]).toBe("answerRequired");
    expect(bad.errors[1].sponsorIndex).toBe("minorNeedsSponsor");
    expect(validateEvisaTravellers([emptyTraveller("adult", "GB")], arrival()).errors[0].personPhoto).toBe("required");
  });

  it("submits a family with one payment, no points, and follows the decision", async () => {
    const u = user();
    const fee = evisaFeeSAR();
    const app = await applyForEvisa(u, { arrivalDate: arrival(), travellers: [briton(), child()], disclaimerAccepted: true, expectedTotalSAR: fee * 2, card });
    expect(app).toMatchObject({ status: "in_progress", totalSAR: fee * 2, refundedSAR: 0, sandbox: true });
    expect(app.applicants.map((a) => a.status)).toEqual(["submitted", "submitted"]);
    expect(app.applicants[1]).toMatchObject({ sponsorIndex: 0, companionType: "DAUGHTER", passportMasked: "•••••4321" });
    // Passport images and photos are never stored.
    const stored = JSON.stringify(await store().get("evisaApps", app.id));
    expect(stored).not.toContain("data:image");
    expect(stored).not.toContain("123456789");
    expect(await getAccount(u.id)).toBeFalsy();
    // Sandbox decision after a minute: approved, one-year visa, with a notification.
    const later = await getEvisaApplication(u, app.id, new Date(Date.now() + 2 * 60_000));
    expect(later!.status).toBe("completed");
    expect(later!.applicants.every((a) => a.status === "approved" && /^\d{10}$/.test(a.visaNumber!))).toBe(true);
    expect((await store().findBy("notifications", "userId", u.id)).length).toBe(2);
    expect((await listEvisaApplications(u.id))[0].id).toBe(app.id);
    // Issued visas are filed in the wallet with their holders (once), not kept as bookings.
    const wallet = await walletOverview(u.id);
    const holders = wallet.people.filter((p) => p.documents.some((d) => d.type === "visa"));
    expect(holders.map((p) => p.nameEn).sort()).toEqual(["AMY SMITH", "JOHN SMITH"]);
    const visa = holders.find((p) => p.nameEn === "JOHN SMITH")!.documents[0];
    expect(visa).toMatchObject({ id: evisaWalletId(app.id, 0), type: "visa", hasFile: true, contentType: "application/pdf", meta: { number: later!.applicants[0].visaNumber } });
    await getEvisaApplication(u, app.id, new Date(Date.now() + 3 * 60_000));
    expect((await store().findBy("wallet", "userId", u.id)).length).toBe(2);
    // The encrypted holder key never leaves the server.
    expect(JSON.stringify(later)).not.toContain("personKeyEnc");
  });

  it("companies apply for their clients with their own reference; a refusal is final", async () => {
    const co = user({ accountType: "company", company: { companyName: "Atlas Travel", commercialRegNo: "1", tourismLicenseNo: "1", vatNo: "", contactPerson: "A B", phone: "+966500000000", city: "RUH" } } as Partial<PublicUser>);
    const fee = evisaFeeSAR();
    const app = await applyForEvisa(co, { arrivalDate: arrival(), travellers: [briton({ firstNameEn: "SANDBOX", familyNameEn: "REJECT" })], disclaimerAccepted: true, clientReference: "CL-77", expectedTotalSAR: fee, card });
    expect(app.clientReference).toBe("CL-77");
    const later = await getEvisaApplication(co, app.id, new Date(Date.now() + 2 * 60_000));
    expect(later!.applicants[0].status).toBe("rejected");
    expect(later!.status).toBe("failed");
    expect(later!.refundedSAR).toBe(0);
  });

  it("refuses what the package would refuse, and changed prices", async () => {
    const u = user();
    const fee = evisaFeeSAR();
    const base = { arrivalDate: arrival(), disclaimerAccepted: true, expectedTotalSAR: fee, card };
    await expect(applyForEvisa(u, { ...base, travellers: [validAdult()] })).rejects.toThrow("invalidTravellers");
    await expect(applyForEvisa(u, { ...base, travellers: [briton()], disclaimerAccepted: false })).rejects.toThrow("disclaimerRequired");
    await expect(applyForEvisa(u, { ...base, travellers: [briton()], arrivalDate: addDays(todayISO(), -1) })).rejects.toThrow("arrivalDate");
    await expect(applyForEvisa(u, { ...base, travellers: [briton()], expectedTotalSAR: fee - 1 })).rejects.toThrow("priceChanged");
    expect(await store().findBy("evisaApps", "userId", u.id)).toHaveLength(0);
  });

  it("audits every application", () => {
    expect(auditedRequest("POST", "/api/evisa")).toBe(true);
    expect(auditedRequest("GET", "/api/evisa")).toBe(false);
  });
});
