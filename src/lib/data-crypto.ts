/**
 * Encryption at rest for personal data (saved travellers' passports and photos).
 * AES-256-GCM with a key from DATA_ENCRYPTION_KEY, or — when unset — derived from the app secret.
 * Changing either makes previously saved data unreadable, so set DATA_ENCRYPTION_KEY once and keep it.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { secretFor } from "./secrets";

const VERSION = "v1";

function key(): Buffer {
  const material = process.env.DATA_ENCRYPTION_KEY?.trim() || secretFor("data");
  return createHash("sha256").update(material).digest();
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url")}`;
}

/** Returns null when the payload is malformed or was encrypted with another key. */
export function decryptJson<T>(payload: string): T | null {
  const [version, body] = payload.split(":");
  if (version !== VERSION || !body) return null;
  try {
    const raw = Buffer.from(body, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")) as T;
  } catch {
    return null;
  }
}
