import { error, handle, json } from "@/lib/http";
import { verifyLicense } from "@/lib/guides/guides";

/** Public licence check by number: valid / expired / notFound. */
export const GET = handle(async (req: Request) => {
  const license = new URL(req.url).searchParams.get("license")?.trim() ?? "";
  if (!license || license.length > 40) return error("invalidRequest", 400);
  return json(await verifyLicense(license));
});
