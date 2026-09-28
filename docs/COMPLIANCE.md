# Compliance: personal data protection (PDPL), NCA controls and in-Kingdom hosting

This document maps the platform's technical controls to the Personal Data Protection Law (PDPL) and its
implementing regulations, and to the NCA Essential Cybersecurity Controls (ECC). It also explains how to
run the platform with all personal data kept in the Kingdom.

The code provides the technical controls. Some obligations are organisational and remain with the
operator: see [Operator checklist](#operator-checklist).

## Controls in the platform

| Requirement | How the platform meets it | Where |
|---|---|---|
| Privacy notice before collection (PDPL art. 12–13) | Public privacy policy at `/{locale}/privacy`. It is shown on every sign-up form and linked in the footer. Retention periods and residency on the page come from the running configuration. | `src/components/privacy-policy.tsx`, `src/components/privacy-notice.tsx` |
| Record of acknowledgement; re-notify on change | Sign-up records the policy version on the user and in `consents`. When `PRIVACY_VERSION` changes, signed-in users see a banner and their acknowledgement is recorded again. | `src/lib/compliance/consent.ts`, `src/lib/compliance/privacy-version.ts` |
| Right of access and copy | Account security → *Download a copy of my data* (JSON). The copy includes the privacy acknowledgements and the user's own security events. | `exportData` in `src/lib/auth/account.ts` |
| Right to correction | Profile and account pages. | — |
| Right to deletion | Account security → *Delete account*. Personal data, documents, devices, identities and acknowledgements are removed. Financial records are kept without the profile. | `deleteAccount` in `src/lib/auth/account.ts` |
| Data minimisation and retention | A daily job (`/api/cron/retention`) deletes expired sessions, links, counters, assistant conversations (30 days), email copies (180 days), notifications (1 year), share links and security logs (default 2 years, minimum 1 year). | `src/lib/compliance/retention.ts` |
| Security of processing | AES-256-GCM encryption at rest for passports, photos and documents; TLS; two-step sign-in; new-device alerts; device management; rate limiting. | `src/lib/data-crypto.ts`, `src/lib/auth/*` |
| Incident notification to SDAIA within 72 hours | A register in Back office → *Compliance* shows the deadline and overdue incidents, and records when SDAIA and affected people were notified. | `src/lib/compliance/incidents.ts` |
| Cross-border transfers (PDPL art. 29) | With `DATA_RESIDENCY=ksa`, services that would send personal data abroad are switched off: AI features, MyMemory translation and Vercel Blob. `CROSS_BORDER_ALLOW` re-enables one once a lawful transfer basis exists. | `src/lib/compliance/residency.ts` |
| Event logs and monitoring (ECC 2-12) | A tamper-evident audit log (HMAC hash chain) records every back-office and ministry request, every account change, the data copy, and sign-ins including failed ones, with IP and device. It never records bodies or tokens. It can be verified from the back office. | `src/lib/compliance/audit.ts`, `src/lib/compliance/request-audit.ts` |
| Access control (ECC 2-2) | Back office limited to `ADMIN_EMAILS`; ministry dashboard to `MINISTRY_EMAILS` or a bearer token. Every access is audited. | `src/lib/config.ts`, `src/lib/auth/admin.ts` |
| Secure configuration of web applications (ECC 2-15) | Content-Security-Policy, HSTS (2 years), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`. Session cookies are `HttpOnly`, `Secure` and `SameSite`. | `next.config.ts`, `src/lib/auth/session.ts` |
| Vulnerability disclosure (ECC 2-10) | `/.well-known/security.txt` (RFC 9116), contact from `SECURITY_CONTACT`. | `src/app/.well-known/security.txt/route.ts` |

## Hosting in the Kingdom

1. **Choose a cloud region in the Kingdom** that holds the required CST/NCA cloud classification for the
   data level. Deploy the container image (`Dockerfile`) and a managed PostgreSQL there, in the same
   region. The current Vercel deployment has no region in the Kingdom, so production personal data
   should move to the self-hosted image.
2. **Build and run:**
   ```sh
   docker build -t saudi-trip .
   docker run -p 3000:3000 --env-file .env.production saudi-trip
   ```
   The image runs as a non-root user and has a health check on `/api/health`.
3. **Environment:**

   | Variable | Value |
   |---|---|
   | `DATA_RESIDENCY` | `ksa` |
   | `DATA_REGION` | Region name, shown in the back office (e.g. `sa-riyadh-1`) |
   | `HOSTING_PROVIDER` | Provider name, shown in the back office |
   | `DATABASE_URL` | PostgreSQL in the same region |
   | `DATA_ENCRYPTION_KEY` | Long random value; keep it in the provider's secret manager and never change it |
   | `SESSION_SECRET` | Long random value |
   | `CRON_SECRET` | Long random value |
   | `ADMIN_EMAILS`, `MINISTRY_EMAILS` | Back-office and ministry accounts |
   | `PRIVACY_CONTACT_EMAIL` | Shown in the privacy policy |
   | `SECURITY_CONTACT` | Shown in `security.txt` |
   | `RESEND_API_URL` / `RESEND_API_KEY` | An email provider hosted in the Kingdom, or leave email as the last remaining transfer and document its basis |
   | `AUDIT_RETENTION_DAYS` | Optional, default 730, minimum 365 |
   | `CROSS_BORDER_ALLOW` | Optional, e.g. `ai`, only with a documented transfer basis |

4. **Scheduled jobs.** Without Vercel Cron, call these daily with `Authorization: Bearer $CRON_SECRET`
   (system cron or a Kubernetes CronJob):
   - `GET /api/cron/retention` (03:30)
   - `GET /api/cron/reminders` (05:00)
5. **Check** Back office → *Compliance*: mode "In the Kingdom", database host in-region, encryption key
   set, cross-border services off, audit chain intact.

## External services and the data they receive

| Service | Data | Location | In-Kingdom mode |
|---|---|---|---|
| Ministry of Tourism eVisa, Nusuk, travel agents and booked providers | What each needs for the booking | Kingdom | Active |
| Payment gateway (SAMA-licensed) | Card payment; the platform keeps last 4 digits and a token | Kingdom | Active |
| SMS provider (`SMS_PROVIDER`) | Mobile number, one-time code | As configured | Active; choose an in-Kingdom provider |
| Email (`RESEND_API_URL`) | Email address, message | Default api.resend.com (abroad) | Active; point to an in-Kingdom provider |
| Anthropic Claude | Assistant and translation text, planner preferences, audio-guide text | Abroad | **Off** unless `CROSS_BORDER_ALLOW=ai` |
| MyMemory | Support message text | Abroad | **Off** unless `CROSS_BORDER_ALLOW=translate` |
| Vercel Blob | Encrypted wallet documents | Abroad | **Off** (new files go to the database) unless `CROSS_BORDER_ALLOW=blob` |
| OpenStreetMap tiles, Overpass, Nominatim, Open-Meteo | Map area, coordinates (no account data) | Abroad | Active (no personal profile); self-host tiles with `NEXT_PUBLIC_MAP_TILE_URL` if required |
| Google Fonts | IP address of the visitor | Abroad | Active; self-host the font if required |

Passport text recognition (OCR) runs entirely in the browser. Passport images reach only the official
eVisa platform and the encrypted wallet.

## Operator checklist

These obligations are organisational and cannot be met in code:

- Register the platform as a controller on SDAIA's National Data Governance Platform and keep the record
  of processing activities up to date.
- Appoint a data protection officer, where required, and publish their contact (`PRIVACY_CONTACT_EMAIL`).
- Carry out and document a data protection impact assessment. Passport and visa data is sensitive
  processing at scale.
- Sign data processing agreements with every processor in the table above.
- Complete an NCA ECC self-assessment, including a penetration test before launch and yearly after.
- Keep encrypted backups in the Kingdom, and test restores.
- Write and rehearse the incident response procedure (who records incidents in the register and who
  notifies SDAIA).
- When the privacy policy text changes materially, update `PRIVACY_VERSION` so users are asked to read
  it again.
