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

const FILE_MAGIC = Buffer.from("STF1");

/** Encrypts a file (AES-256-GCM): "STF1" + iv + tag + ciphertext. */
export function encryptBytes(data: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([FILE_MAGIC, iv, cipher.getAuthTag(), body]);
}

/** Returns null when the payload is not an encrypted file or was encrypted with another key. */
export function decryptBytes(payload: Buffer): Buffer | null {
  if (payload.length < 32 || !payload.subarray(0, 4).equals(FILE_MAGIC)) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), payload.subarray(4, 16));
    decipher.setAuthTag(payload.subarray(16, 32));
    return Buffer.concat([decipher.update(payload.subarray(32)), decipher.final()]);
  } catch {
    return null;
  }
}
