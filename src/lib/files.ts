/**
 * Encrypted file storage for the digital wallet. Files are encrypted (AES-256-GCM) before they
 * leave the server, then stored in Vercel Blob when BLOB_READ_WRITE_TOKEN is set (production),
 * or in the database otherwise (development / tests).
 */
import { randomUUID } from "node:crypto";
import { del, get, put } from "@vercel/blob";
import { decryptBytes, encryptBytes } from "./data-crypto";
import { store } from "./store";

export interface StoredFileRef {
  backend: "blob" | "db";
  /** Blob URL, or the id in the "files" collection. */
  key: string;
  access?: "public" | "private";
  contentType: string;
  size: number;
}

export const blobConfigured = () => !!process.env.BLOB_READ_WRITE_TOKEN?.trim();

async function putBlob(pathname: string, body: Buffer): Promise<{ url: string; access: "public" | "private" }> {
  // The store may be public or private; the content is encrypted either way.
  const first = (process.env.BLOB_ACCESS === "private" ? "private" : "public") as "public" | "private";
  try {
    const r = await put(pathname, body, { access: first, addRandomSuffix: true, contentType: "application/octet-stream" });
    return { url: r.url, access: first };
  } catch (err) {
    const other = first === "public" ? "private" : "public";
    if (!/access|private|public/i.test((err as Error).message)) throw err;
    const r = await put(pathname, body, { access: other, addRandomSuffix: true, contentType: "application/octet-stream" });
    return { url: r.url, access: other };
  }
}

export async function saveFile(folder: string, data: Buffer, contentType: string): Promise<StoredFileRef> {
  const enc = encryptBytes(data);
  if (blobConfigured()) {
    const { url, access } = await putBlob(`wallet/${folder}/${randomUUID()}.bin`, enc);
    return { backend: "blob", key: url, access, contentType, size: data.length };
  }
  const id = randomUUID();
  await store().put("files", id, { id, data: enc.toString("base64") });
  return { backend: "db", key: id, contentType, size: data.length };
}

export async function readFile(ref: StoredFileRef): Promise<Buffer | null> {
  let enc: Buffer | null = null;
  if (ref.backend === "blob") {
    const res = await get(ref.key, { access: ref.access ?? "public" });
    if (!res?.stream) return null;
    enc = Buffer.from(await new Response(res.stream).arrayBuffer());
  } else {
    const doc = await store().get<{ data: string }>("files", ref.key);
    enc = doc ? Buffer.from(doc.data, "base64") : null;
  }
  return enc ? decryptBytes(enc) : null;
}

export async function deleteFile(ref: StoredFileRef): Promise<void> {
  if (ref.backend === "blob") await del(ref.key).catch(() => undefined);
  else await store().delete("files", ref.key);
}

/** Content type from the file's first bytes (PDF, JPEG, PNG); null for anything else. */
export function sniffContentType(data: Buffer): "application/pdf" | "image/jpeg" | "image/png" | null {
  if (data.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}
