/**
 * Traveller notifications (email). Without an email provider configured the messages are only
 * logged (sandbox); a provider (e.g. SES, SendGrid, Resend) plugs in here.
 */
export async function notifyTravellers(emails: string[], message: { subject: string; text: string }): Promise<void> {
  if (!emails.length) return;
  console.info(`[notify] to=${emails.join(",")} subject=${JSON.stringify(message.subject)}`);
}
