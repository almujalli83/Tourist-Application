/**
 * Privacy notice acknowledgements (PDPL: the data subject is informed before collection, and
 * again when the notice changes). The current version is on the user; every acknowledgement is
 * kept in "consents" as the record.
 */
import { store } from "../store";
import { PRIVACY_VERSION } from "./privacy-version";

export { needsPrivacyAck, PRIVACY_VERSION } from "./privacy-version";

export type AckMethod = "signup" | "banner";

export interface ConsentEvent { kind: "privacy"; version: string; at: string; method: AckMethod }
export interface ConsentDoc { id: string; userId: string; events: ConsentEvent[] }

export async function recordPrivacyAck(userId: string, method: AckMethod, now = new Date()): Promise<{ version: string; at: string }> {
  const s = store();
  const ev: ConsentEvent = { kind: "privacy", version: PRIVACY_VERSION, at: now.toISOString(), method };
  await s.insert<ConsentDoc>("consents", userId, { id: userId, userId, events: [] });
  await s.update<ConsentDoc>("consents", userId, (d) => ({ ...d, events: [...d.events, ev].slice(-50) }));
  return { version: ev.version, at: ev.at };
}
