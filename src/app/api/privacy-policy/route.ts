import { error, json } from "@/lib/http";
import { getMtClient } from "@/lib/mt-evisa/client";

/** Proxies the MT getPrivacyPolicy API (declarations shown before submission). */
export async function GET() {
  try {
    return json(await getMtClient().getPrivacyPolicy());
  } catch {
    return error("unavailable", 502);
  }
}
