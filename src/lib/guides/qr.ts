import { headers } from "next/headers";
import QRCode from "qrcode";

/** The site origin of the current request (for links in QR codes). */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** QR (SVG) that opens the public licence check of a guide. */
export async function guideQrSvg(locale: string, licenseNo: string): Promise<string> {
  const url = `${await requestOrigin()}/${locale}/verify/guide/${encodeURIComponent(licenseNo)}`;
  return QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}
