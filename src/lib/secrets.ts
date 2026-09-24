/**
 * Server signing secret (session cookies and travel-agent offers).
 *
 * Source, in order: the SESSION_SECRET environment variable; otherwise — when a database is
 * configured — a random 256-bit secret generated once and stored in the database, so every
 * server instance shares it; otherwise a fixed development-only value (never in production).
 * Separate keys are derived per purpose so a session token can never pass as an offer signature.
 */
import { createHmac, randomBytes } from "node:crypto";
import { databaseUrl, store } from "./store";

export class ServerConfigError extends Error {
  name = "ServerConfigError";
}

type Source = "env" | "database" | "development" | "missing";

const g = globalThis as unknown as { __appSecret?: { value: string; source: Source }; __appSecretLoading?: Promise<void> };

const envSecret = () => process.env.SESSION_SECRET?.trim() || null;
const isProduction = () => process.env.NODE_ENV === "production";

async function loadFromDatabase(): Promise<string> {
  const s = store();
  const existing = await s.get<{ value: string }>("config", "appSecret");
  if (existing?.value) return existing.value;
  const value = randomBytes(32).toString("base64url");
  if (await s.insert("config", "appSecret", { value })) return value;
  // Another instance created it first: use theirs.
  return (await s.get<{ value: string }>("config", "appSecret"))!.value;
}

/** Resolves the secret once per server instance. Call before signing or verifying. */
export async function ensureSecrets(): Promise<void> {
  if (g.__appSecret) return;
  const env = envSecret();
  if (env) {
    g.__appSecret = { value: env, source: "env" };
    return;
  }
  if (databaseUrl()) {
    g.__appSecretLoading ??= loadFromDatabase()
      .then((value) => {
        g.__appSecret = { value, source: "database" };
      })
      .catch((err) => {
        g.__appSecretLoading = undefined;
        throw err;
      });
    await g.__appSecretLoading;
    return;
  }
  if (!isProduction()) g.__appSecret = { value: "dev-only-secret", source: "development" };
}

export function secretSource(): Source {
  return g.__appSecret?.source ?? (envSecret() ? "env" : isProduction() ? "missing" : "development");
}

/** Purpose-specific key derived from the master secret. */
export function secretFor(purpose: "session" | "offers"): string {
  const master = g.__appSecret?.value ?? envSecret() ?? (isProduction() ? null : "dev-only-secret");
  if (!master)
    throw new ServerConfigError("No signing secret: set SESSION_SECRET or configure DATABASE_URL (required in production)");
  return createHmac("sha256", master).update(`saudi-trip:${purpose}`).digest("base64url");
}

/** Test helper. */
export function resetSecretsForTests() {
  g.__appSecret = undefined;
  g.__appSecretLoading = undefined;
}
