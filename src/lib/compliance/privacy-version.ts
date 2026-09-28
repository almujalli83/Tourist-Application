/** Bump when the privacy policy changes materially: signed-in users are asked to read it again. */
export const PRIVACY_VERSION = "2026-09";

export const needsPrivacyAck = (u: { privacy?: { version: string } | null } | null | undefined) => !!u && u.privacy?.version !== PRIVACY_VERSION;
