/**
 * Connector to the ministry's central platform for the official eVisa and insurance policy
 * documents (the MT OTA API returns their data, not the files).
 *
 * Live mode (CENTRAL_PLATFORM_URL + CENTRAL_PLATFORM_TOKEN): GET
 *   {url}/visas/{visaNumber}/document and {url}/visas/{visaNumber}/insurance-document
 * returning the PDF (the contract is to be confirmed with the ministry).
 * Sandbox: returns specimen PDFs clearly marked as not official.
 */
import { simplePdf } from "./simple-pdf";

export interface TravelDocumentRequest {
  applicationNo: string;
  visaNumber: string;
  nameEn: string;
  passportNo: string;
  nationality: string;
  visaIssueDate: string | null;
  visaExpiryDate: string | null;
}

export interface FetchedDocument {
  data: Buffer;
  contentType: "application/pdf";
}

export const centralPlatformMode = () =>
  process.env.CENTRAL_PLATFORM_URL?.trim() && process.env.CENTRAL_PLATFORM_TOKEN?.trim() ? "live" : "sandbox";

async function fetchLive(path: string): Promise<FetchedDocument | null> {
  const res = await fetch(`${process.env.CENTRAL_PLATFORM_URL!.trim().replace(/\/$/, "")}${path}`, {
    headers: { authorization: `Bearer ${process.env.CENTRAL_PLATFORM_TOKEN!.trim()}`, accept: "application/pdf" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return { data: Buffer.from(await res.arrayBuffer()), contentType: "application/pdf" };
}

function specimen(title: string, r: TravelDocumentRequest): FetchedDocument {
  return {
    contentType: "application/pdf",
    data: simplePdf([
      { text: "SANDBOX SPECIMEN - NOT AN OFFICIAL DOCUMENT", size: 16, bold: true },
      { text: "Generated for testing until the central platform is connected.", size: 10 },
      { text: " " },
      { text: title, size: 14, bold: true },
      { text: `Name: ${r.nameEn}` },
      { text: `Passport: ${r.passportNo} (${r.nationality})` },
      { text: `Visa number: ${r.visaNumber}` },
      { text: `Application: ${r.applicationNo}` },
      { text: `Issued: ${r.visaIssueDate ?? "-"}   Expires: ${r.visaExpiryDate ?? "-"}` },
    ]),
  };
}

export async function fetchVisaDocument(r: TravelDocumentRequest): Promise<FetchedDocument | null> {
  if (centralPlatformMode() === "live") return fetchLive(`/visas/${encodeURIComponent(r.visaNumber)}/document`).catch(() => null);
  return specimen("Tourist eVisa", r);
}

export async function fetchInsuranceDocument(r: TravelDocumentRequest): Promise<FetchedDocument | null> {
  if (centralPlatformMode() === "live") return fetchLive(`/visas/${encodeURIComponent(r.visaNumber)}/insurance-document`).catch(() => null);
  return specimen("Visitor medical insurance policy", r);
}
