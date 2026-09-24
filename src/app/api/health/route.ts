import { AGENTS } from "@/lib/agents/registry";
import { mtConfig } from "@/lib/config";
import { json } from "@/lib/http";
import { databaseUrl } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Deployment diagnostics: which version is running and whether the required settings are
 * present. Reports booleans only — never secret values.
 */
export async function GET() {
  return json({
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    agents: AGENTS.map((a) => a.nameEn),
    config: {
      sessionSecret: Boolean(process.env.SESSION_SECRET || process.env.OFFER_SECRET),
      database: Boolean(databaseUrl()),
      mtEvisa: mtConfig().mock ? "sandbox" : "live",
    },
  });
}
