import { describe, expect, it } from "vitest";
import type { StoredBooking } from "@/lib/bookings/types";
import { decryptBytes, encryptBytes } from "@/lib/data-crypto";
import { sniffContentType } from "@/lib/files";
import { saveBooking } from "@/lib/repo";
import { simplePdf } from "@/lib/simple-pdf";
import { store } from "@/lib/store";
import {
  deleteWalletDocument, expiryState, readWalletFile, syncIssuedDocuments, uploadWalletDocument, walletOverview,
} from "@/lib/wallet";

const run = Math.random().toString(36).slice(2, 8);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]);

function booking(userId: string, id: string, issued: boolean): StoredBooking {
  const applicant = {
    applicationNo: `${id}01`, paxType: "adult" as const, nameEn: "SARA ALI", nationality: "EG", passportNo: "A1234567", email: "s@example.com",
    sponsorApplicationNo: null, submission: null, appStatus: "COMPLETED", visaNumber: issued ? "6012345678" : null, visaIssueDate: issued ? "2026-09-20" : null,
    visaExpiryDate: issued ? "2027-09-20" : null, visaStatus: issued ? "ISSUED" : null, insuranceStatus: issued ? "ISSUED" : null,
  };
  return {
    id, reference: `TA-${id}`, userId, accountType: "individual", clientReference: null, createdAt: "2026-09-20T10:00:00Z",
    criteria: { origin: "CAI", stays: [{ city: "RUH", nights: 3 }], departureDate: "2026-10-10", returnDate: "2026-10-13", rooms: [{ adults: 1, childAges: [] }], pax: { adults: 1, children: 0, infants: 0 }, cabin: "economy", nationality: "EG" },
    flights: [], hotels: [], activities: [],
    price: { flightsSAR: 0, hotelsSAR: 0, activitiesSAR: 0, visaInsuranceSAR: 402.21, visaFeePerTravellerSAR: 402.21, travellers: 1, totalSAR: 402.21 },
    displayCurrency: "SAR", payment: { transactionId: "T", method: "visa", last4: "1111", amountSAR: 402.21, paidAt: "2026-09-20T10:00:00Z" },
    status: "COMPLETED", mt: { mode: "sandbox", messageId: "m", packageId: "p", packageStatus: "COMPLETED", lastCheckedAt: null },
    applicants: [applicant],
  };
}

describe("wallet files", () => {
  it("encrypts files and recognises PDF / JPEG / PNG only", () => {
    const enc = encryptBytes(JPEG);
    expect(enc.includes(JPEG.subarray(0, 64))).toBe(false);
    expect(decryptBytes(enc)?.equals(JPEG)).toBe(true);
    expect(sniffContentType(simplePdf([{ text: "x" }]))).toBe("application/pdf");
    expect(sniffContentType(JPEG)).toBe("image/jpeg");
    expect(sniffContentType(Buffer.from("<html>"))).toBeNull();
    expect(expiryState("2026-09-01", "2026-09-25")).toBe("expired");
    expect(expiryState("2026-10-10", "2026-09-25")).toBe("expiring");
    expect(expiryState("2027-10-10", "2026-09-25")).toBe("valid");
  });
});

describe("wallet documents", () => {
  it("adds the issued visa and insurance once per application, and never re-adds deleted ones", async () => {
    const b = booking(`w-u1-${run}`, `wb1-${run}`, true);
    await saveBooking(b);
    expect(await syncIssuedDocuments(`w-u1-${run}`, [b])).toBe(2);
    expect(await syncIssuedDocuments(`w-u1-${run}`, [b])).toBe(0);
    const overview = await walletOverview(`w-u1-${run}`);
    const person = overview.people.find((p) => p.key === "EG:A1234567")!;
    expect(person.bookings.map((x) => x.reference)).toEqual([`TA-wb1-${run}`]);
    expect(person.documents.map((d) => d.type).sort()).toEqual(["insurance", "visa"]);
    const visa = person.documents.find((d) => d.type === "visa")!;
    expect(visa).toMatchObject({ source: "central", hasFile: true, contentType: "application/pdf", meta: { number: "6012345678", expiryDate: "2027-09-20" } });
    const file = await readWalletFile(`w-u1-${run}`, visa.id);
    expect(file?.data.subarray(0, 5).toString()).toBe("%PDF-");
    // Only the owner can read it.
    expect(await readWalletFile("someone-else", visa.id)).toBeNull();
    expect(await deleteWalletDocument(`w-u1-${run}`, visa.id)).toBe(true);
    expect(await syncIssuedDocuments(`w-u1-${run}`, [b])).toBe(0);
    expect((await walletOverview(`w-u1-${run}`)).people[0].documents.map((d) => d.type)).toEqual(["insurance"]);
  });

  it("does not add documents before the visa is issued", async () => {
    const b = booking(`w-u2-${run}`, `wb2-${run}`, false);
    await saveBooking(b);
    expect(await syncIssuedDocuments(`w-u2-${run}`, [b])).toBe(0);
  });

  it("validates uploads: known traveller, allowed type, real PDF/image, size", async () => {
    await saveBooking(booking(`w-u3-${run}`, `wb3-${run}`, false));
    const up = (o: Partial<Parameters<typeof uploadWalletDocument>[1]>) =>
      uploadWalletDocument(`w-u3-${run}`, { personKey: "EG:A1234567", type: "passport", data: JPEG, ...o });
    await expect(up({ personKey: "EG:OTHER" })).rejects.toThrow("unknownPerson");
    await expect(up({ type: "selfie" })).rejects.toThrow("invalidType");
    await expect(up({ data: Buffer.from("<script>alert(1)</script>") })).rejects.toThrow("unsupportedFile");
    await expect(up({ data: Buffer.concat([JPEG, Buffer.alloc(4 * 1024 * 1024)]) })).rejects.toThrow("tooLarge");
    const doc = await up({ meta: { number: "A1234567", expiryDate: "2030-01-01", issueDate: "bad" } });
    expect(doc).toMatchObject({ type: "passport", source: "upload", contentType: "image/jpeg", meta: { number: "A1234567", expiryDate: "2030-01-01" } });
    // Stored encrypted: neither the metadata nor the file appear in clear.
    const raw = JSON.stringify(await store().get("wallet", doc.id)) + JSON.stringify(await store().list("files"));
    expect(raw).not.toContain("A1234567");
    expect((await readWalletFile(`w-u3-${run}`, doc.id))?.data.equals(JPEG)).toBe(true);
    expect(await deleteWalletDocument(`w-u3-${run}`, doc.id)).toBe(true);
    expect(await store().get("wallet", doc.id)).toBeNull();
  });
});
